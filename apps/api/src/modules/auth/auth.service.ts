import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
  hashPassword,
  verifyPassword,
} from "../../core/security/password";

import { authRepository } from "./auth.repository";
import { usernameBloomFilter } from "./username-bloom-filter";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  RefreshTokenPayload,
} from "../../core/security/jwt";

import { generateSecret, verifyTOTP } from "../../core/security/totp";
import { emailService } from "../email/email.service";
import { EmailType } from "../email/email.types";

import { AppError } from "../../shared/errors/app-error";

import {
  InvalidCredentialsError,
  UserAlreadyExistsError,
  UserNotFoundError,
} from "./auth.errors";

import type {
  AuthenticatedUser,
  CreateUserInput,
  LoginRequest,
  RegisterUserRequest,
  RegisterUserResponse,
  LoginResult,
  UserRecord,
} from "./auth.types";

const JWT_SECRET = process.env.JWT_SECRET || "super-secure-dev-jwt-secret-key-123456";

class AuthService {
  // --- OTP Verification ---
  public async sendOTP(email: string): Promise<void> {
    // Enforce 1-minute rate limit
    const latest = await authRepository.findLatestOTP(email);
    if (latest) {
      const timeSinceLast = Date.now() - new Date(latest.createdAt).getTime();
      if (timeSinceLast < 60 * 1000) {
        throw new AppError({
          message: `Please wait ${Math.ceil((60 * 1000 - timeSinceLast) / 1000)} seconds before requesting a new OTP.`,
          statusCode: 429,
          code: "OTP_RATE_LIMIT_EXCEEDED",
        });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins validity

    await authRepository.createOTP(email, otp, expiresAt);

    // Enqueue email verification OTP job asynchronously
    await emailService.enqueue(email, EmailType.EMAIL_VERIFICATION, {
      username: "User",
      otp,
    });
  }

  public async register(
    input: RegisterUserRequest & { otp: string },
  ): Promise<RegisterUserResponse> {
    // 1. Verify OTP
    const latest = await authRepository.findLatestOTP(input.email);
    if (!latest || latest.otp !== input.otp) {
      throw new AppError({
        message: "Invalid email verification code.",
        statusCode: 400,
        code: "AUTH_INVALID_OTP",
      });
    }

    if (new Date() > new Date(latest.expiresAt)) {
      throw new AppError({
        message: "Email verification code has expired.",
        statusCode: 400,
        code: "AUTH_EXPIRED_OTP",
      });
    }

    // Clean up OTPs
    await authRepository.deleteOTPsForEmail(input.email);

    // 2. Pre-check username availability
    try {
      await authRepository.findUserByUsername(input.username);
      throw new UserAlreadyExistsError("username");
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
    }

    // 3. Pre-check email availability
    try {
      await authRepository.findUserByEmail(input.email);
      throw new UserAlreadyExistsError("email");
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
    }

    // 4. Pre-check phone number availability
    try {
      await authRepository.findUserByPhone(input.phoneNumber);
      throw new UserAlreadyExistsError("phoneNumber");
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
    }

    const passwordHash = await hashPassword(input.password);

    const createUserInput: CreateUserInput = {
      username: input.username,
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
    };

    const user = await authRepository.createUser(createUserInput);
    
    // Mark user as verified since they verified their OTP during registration
    await authRepository.verifyUser(user.id);

    // Enqueue a Welcome email
    await emailService.enqueue(user.email, EmailType.WELCOME, {
      username: user.username,
    });

    usernameBloomFilter.add(user.username.toLowerCase());
    return user;
  }

  // --- Login & Session ---
  public async login(
    input: LoginRequest,
  ): Promise<
    | LoginResult
    | { mfaRequired: true; mfaToken: string }
    | { mfaSetupRequired: true; mfaToken: string; mfaSetup: { secret: string; qrCodeUrl: string } }
  > {
    const user = input.identifier.includes("@")
      ? await authRepository.findUserByEmail(input.identifier)
      : await authRepository.findUserByUsername(input.identifier);

    const isPasswordValid = await verifyPassword(
      input.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    // Prevent login if account is not verified
    if (!user.isVerified) {
      throw new AppError({
        message: "Email address has not been verified.",
        statusCode: 403,
        code: "AUTH_EMAIL_NOT_VERIFIED",
      });
    }

    const mfaToken = jwt.sign(
      { userId: user.id, type: "mfa" },
      JWT_SECRET,
      { expiresIn: "5m" }
    );

    // Enforce Mandatory MFA
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      // Setup is required on first login
      const secret = generateSecret();
      const otpauthUrl = `otpauth://totp/NexVault:${user.username}?secret=${secret}&issuer=NexVault`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

      return {
        mfaSetupRequired: true,
        mfaToken,
        mfaSetup: {
          secret,
          qrCodeUrl,
        },
      };
    }

    return {
      mfaRequired: true,
      mfaToken,
    };
  }

  public async verify2FALogin(
    mfaToken: string,
    code: string,
  ): Promise<LoginResult> {
    let payload: { userId: string; type: string };
    try {
      payload = jwt.verify(mfaToken, JWT_SECRET) as any;
    } catch (err) {
      throw new AppError({
        message: "Invalid or expired MFA session.",
        statusCode: 401,
        code: "AUTH_MFA_SESSION_INVALID",
      });
    }

    if (payload.type !== "mfa") {
      throw new AppError({
        message: "Invalid session type.",
        statusCode: 401,
        code: "AUTH_MFA_SESSION_INVALID",
      });
    }

    const user = await authRepository.findUserById(payload.userId);
    if (!user.twoFactorSecret || !verifyTOTP(user.twoFactorSecret, code)) {
      throw new AppError({
        message: "Invalid authenticator code.",
        statusCode: 401,
        code: "AUTH_MFA_CODE_INVALID",
      });
    }

    return this.generateUserSession(user);
  }

  public async verifyAndSetup2FA(
    mfaToken: string,
    secret: string,
    code: string,
  ): Promise<LoginResult> {
    let payload: { userId: string; type: string };
    try {
      payload = jwt.verify(mfaToken, JWT_SECRET) as any;
    } catch (err) {
      throw new AppError({
        message: "Invalid or expired MFA setup session.",
        statusCode: 401,
        code: "AUTH_MFA_SESSION_INVALID",
      });
    }

    if (payload.type !== "mfa") {
      throw new AppError({
        message: "Invalid session type.",
        statusCode: 401,
        code: "AUTH_MFA_SESSION_INVALID",
      });
    }

    const isValid = verifyTOTP(secret, code);
    if (!isValid) {
      throw new AppError({
        message: "Invalid authenticator code.",
        statusCode: 400,
        code: "AUTH_MFA_CODE_INVALID",
      });
    }

    // Enable 2FA on the user
    await authRepository.update2FA(payload.userId, true, secret);

    const user = await authRepository.findUserById(payload.userId);
    
    // Enqueue security alert for 2FA enabled
    await emailService.enqueue(user.email, EmailType.SECURITY_ALERT, {
      username: user.username,
      alertMessage: "Two-Factor Authentication has been enabled on your account.",
      ipAddress: "Unknown",
    });

    return this.generateUserSession(user);
  }

  // --- 2FA Management ---
  public async enable2FA(userId: string): Promise<{ secret: string; qrCodeUrl: string }> {
    const user = await authRepository.findUserById(userId);
    const secret = generateSecret();
    const otpauthUrl = `otpauth://totp/NexVault:${user.username}?secret=${secret}&issuer=NexVault`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

    return { secret, qrCodeUrl };
  }

  public async verifyAndEnable2FA(
    userId: string,
    secret: string,
    code: string,
  ): Promise<void> {
    const isValid = verifyTOTP(secret, code);
    if (!isValid) {
      throw new AppError({
        message: "Invalid authenticator code.",
        statusCode: 400,
        code: "AUTH_MFA_CODE_INVALID",
      });
    }

    await authRepository.update2FA(userId, true, secret);
  }

  public async disable2FA(userId: string): Promise<void> {
    throw new AppError({
      message: "Multi-factor authentication is mandatory and cannot be disabled.",
      statusCode: 400,
      code: "AUTH_MFA_MANDATORY",
    });
  }

  // --- Password Reset ---
  public async forgotPassword(email: string, origin = "http://localhost:3001"): Promise<void> {
    try {
      const user = await authRepository.findUserByEmail(email);
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await authRepository.createPasswordReset(user.id, token, expiresAt);

      const resetLink = `${origin}/reset-password?token=${token}`;

      // Enqueue password reset job asynchronously
      await emailService.enqueue(user.email, EmailType.PASSWORD_RESET, {
        username: user.username,
        resetLink,
      });
    } catch (error) {
      // Silently ignore UserNotFoundError to prevent email enumeration
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
      console.log(`[Forgot Password] Requested for non-existent email: ${email}`);
    }
  }

  public async resetPassword(token: string, passwordMask: string): Promise<void> {
    const reset = await authRepository.findPasswordResetByToken(token);
    if (!reset) {
      throw new AppError({
        message: "Invalid or expired password reset token.",
        statusCode: 400,
        code: "AUTH_RESET_TOKEN_INVALID",
      });
    }

    if (new Date() > new Date(reset.expiresAt)) {
      await authRepository.deletePasswordReset(token);
      throw new AppError({
        message: "Password reset token has expired.",
        statusCode: 400,
        code: "AUTH_RESET_TOKEN_EXPIRED",
      });
    }

    const passwordHash = await hashPassword(passwordMask);
    await authRepository.updateUserPassword(reset.userId, passwordHash);
    
    // Revoke all active sessions for security
    await authRepository.revokeAllUserRefreshTokens(reset.userId);
    
    // Clean up reset token
    await authRepository.deletePasswordReset(token);

    const user = await authRepository.findUserById(reset.userId);

    // Enqueue password changed notification
    await emailService.enqueue(user.email, EmailType.PASSWORD_CHANGED, {
      username: user.username,
      subject: "Your password has been changed",
      message: "This is a confirmation that the password for your NexVault account has been successfully changed.",
    });
  }

  // --- Verify Email ---
  public async verifyEmail(email: string, otp: string): Promise<void> {
    const latest = await authRepository.findLatestOTP(email);
    if (!latest || latest.otp !== otp) {
      throw new AppError({
        message: "Invalid email verification code.",
        statusCode: 400,
        code: "AUTH_INVALID_OTP",
      });
    }

    if (new Date() > new Date(latest.expiresAt)) {
      throw new AppError({
        message: "Email verification code has expired.",
        statusCode: 400,
        code: "AUTH_EXPIRED_OTP",
      });
    }

    // Clean up OTPs
    await authRepository.deleteOTPsForEmail(email);

    // Find user and verify
    const user = await authRepository.findUserByEmail(email);
    await authRepository.verifyUser(user.id);
  }

  // --- Social Logins (Simulated) ---
  public async socialLogin(
    provider: "google" | "github",
    profile: { id: string; email: string; username: string },
  ): Promise<LoginResult> {
    let user: any;
    try {
      user = await authRepository.findUserByEmail(profile.email);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        // Create user
        const tempPassword = crypto.randomBytes(16).toString("hex");
        const passwordHash = await hashPassword(tempPassword);
        const phone = "0000000000"; // placeholder

        // Handle username clashes
        let username = profile.username;
        try {
          await authRepository.findUserByUsername(username);
          username = `${username}_${crypto.randomBytes(4).toString("hex")}`;
        } catch (uErr) {}

        const created = await authRepository.createUser({
          username,
          email: profile.email,
          phoneNumber: phone,
          passwordHash,
        });

        await authRepository.verifyUser(created.id);
        user = await authRepository.findUserById(created.id);
        usernameBloomFilter.add(user.username.toLowerCase());

        // Enqueue welcome email for social login
        await emailService.enqueue(user.email, EmailType.WELCOME, {
          username: user.username,
        });
      } else {
        throw err;
      }
    }

    // Note: Social logins are verified immediately, but since MFA is mandatory,
    // they still need 2FA enabled!
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      const mfaToken = jwt.sign(
        { userId: user.id, type: "mfa" },
        JWT_SECRET,
        { expiresIn: "5m" }
      );
      const secret = generateSecret();
      const otpauthUrl = `otpauth://totp/NexVault:${user.username}?secret=${secret}&issuer=NexVault`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

      return {
        mfaSetupRequired: true,
        mfaToken,
        mfaSetup: {
          secret,
          qrCodeUrl,
        },
      } as any;
    }

    return {
      mfaRequired: true,
      mfaToken: jwt.sign(
        { userId: user.id, type: "mfa" },
        JWT_SECRET,
        { expiresIn: "5m" }
      ),
    } as any;
  }

  // --- Refresh Session ---
  public async refresh(
    refreshToken: string,
  ): Promise<LoginResult> {
    let payload: RefreshTokenPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      throw new AppError({
        message: "Invalid or expired refresh token.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_INVALID",
      });
    }

    const tokenRecord = await authRepository.findRefreshTokenById(payload.tokenId);

    if (!tokenRecord) {
      throw new AppError({
        message: "Refresh token not found.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_NOT_FOUND",
      });
    }

    // Reuse detection
    if (tokenRecord.isRevoked) {
      if (tokenRecord.replacedBy) {
        await authRepository.revokeAllUserRefreshTokens(tokenRecord.userId);
        throw new AppError({
          message: "Refresh token reuse detected. All sessions revoked.",
          statusCode: 401,
          code: "AUTH_REFRESH_TOKEN_REUSE",
        });
      }

      throw new AppError({
        message: "Refresh token has been revoked.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_REVOKED",
      });
    }

    if (new Date() > new Date(tokenRecord.expiresAt)) {
      throw new AppError({
        message: "Refresh token has expired.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_EXPIRED",
      });
    }

    const user = await authRepository.findUserById(tokenRecord.userId);

    // Rotate the refresh token
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newToken = await authRepository.replaceRefreshToken(
      tokenRecord.id,
      user.id,
      refreshExpiresAt
    );

    const newAccessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const newRefreshToken = generateRefreshToken({
      userId: user.id,
      tokenId: newToken.id,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  public async logout(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await authRepository.revokeRefreshToken(payload.tokenId);
    } catch (err) {
      // Already cleared
    }
  }

  // --- Helper: Generate Session ---
  private async generateUserSession(user: UserRecord): Promise<LoginResult> {
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };

    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dbToken = await authRepository.createRefreshToken(user.id, refreshExpiresAt);

    const refreshToken = generateRefreshToken({
      userId: user.id,
      tokenId: dbToken.id,
    });

    return {
      user: authenticatedUser,
      accessToken,
      refreshToken,
    };
  }
}

export const authService = new AuthService();
