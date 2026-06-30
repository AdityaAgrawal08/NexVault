import crypto from "crypto";
import jwt from "jsonwebtoken";

import {
  hashPassword,
  verifyPassword,
} from "../../core/security/password";

import { authRepository } from "./auth.repository";
import { db } from "../../core/database/postgres";
import { usernameBloomFilter } from "./username-bloom-filter";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  RefreshTokenPayload,
} from "../../core/security/jwt";

import { emailService } from "../email/email.service";
import { EmailType } from "../email/email.types";
import { auditService } from "../audit/audit.service";
import { otpService, OTPPurpose } from "../otp/otp.service";

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
    await otpService.sendOTP(email, OTPPurpose.EMAIL_VERIFICATION);
  }

  public async register(
    input: RegisterUserRequest & { otp: string },
  ): Promise<RegisterUserResponse> {
    // 1. Verify OTP
    await otpService.verifyOTP(input.email, OTPPurpose.EMAIL_VERIFICATION, input.otp);

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

    // Log registration
    await auditService.log({
      userId: user.id,
      action: "ACCOUNT_CREATED",
      metadata: { username: user.username, email: user.email },
    });

    usernameBloomFilter.add(user.username.toLowerCase());
    return user;
  }

  // --- Login & Session ---
  public async login(
    input: LoginRequest,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const user = input.identifier.includes("@")
      ? await authRepository.findUserByEmail(input.identifier)
      : await authRepository.findUserByUsername(input.identifier);

    // Check Account Lockout
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      const lockRemainingSeconds = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 1000);
      
      await auditService.log({
        userId: user.id,
        action: "LOGIN_BLOCKED_LOCKED",
        ipAddress,
        userAgent,
        metadata: { lockRemainingSeconds },
      });

      throw new AppError({
        message: `Account is temporarily locked due to too many failed login attempts. Please try again in ${Math.ceil(lockRemainingSeconds / 60)} minutes.`,
        statusCode: 423,
        code: "AUTH_ACCOUNT_LOCKED",
      });
    }

    const isPasswordValid = await verifyPassword(
      input.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      const lockoutStatus = await authRepository.incrementFailedAttempts(user.id);
      
      await auditService.log({
        userId: user.id,
        action: lockoutStatus.lockedUntil ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
        ipAddress,
        userAgent,
        metadata: { attempts: lockoutStatus.failedLoginAttempts },
      });

      if (lockoutStatus.lockedUntil) {
        throw new AppError({
          message: "Account has been locked for 15 minutes due to 5 consecutive failed login attempts.",
          statusCode: 423,
          code: "AUTH_ACCOUNT_LOCKED",
        });
      }

      throw new InvalidCredentialsError();
    }

    // Reset failed login attempts on successful password check
    await authRepository.resetFailedAttempts(user.id);

    // Prevent login if account is not verified
    if (!user.isVerified) {
      throw new AppError({
        message: "Email address has not been verified.",
        statusCode: 403,
        code: "AUTH_EMAIL_NOT_VERIFIED",
      });
    }

    // Log successful login
    await auditService.log({
      userId: user.id,
      action: "LOGIN_SUCCESS",
      ipAddress,
      userAgent,
    });

    return this.generateUserSession(user, ipAddress, userAgent);
  }

  // --- Re-authentication ---
  private generateReauthToken(userId: string): string {
    return jwt.sign(
      { userId, type: "reauth" },
      JWT_SECRET,
      { expiresIn: "5m" } // Short-lived (5 minutes)
    );
  }

  public async reauthWithPassword(userId: string, passwordMask: string): Promise<string> {
    const user = await authRepository.findUserById(userId);
    const isValid = await verifyPassword(passwordMask, user.passwordHash);

    if (!isValid) {
      throw new AppError({
        message: "Incorrect password.",
        statusCode: 401,
        code: "AUTH_REAUTH_PASSWORD_FAILED",
      });
    }

    await auditService.log({
      userId,
      action: "REAUTH_PASSWORD_SUCCESS",
    });

    return this.generateReauthToken(userId);
  }

  public async sendReauthOTP(userId: string): Promise<void> {
    const user = await authRepository.findUserById(userId);
    await otpService.sendOTP(user.email, OTPPurpose.REAUTHENTICATION, user.username);
  }

  public async verifyReauthOTP(userId: string, otp: string): Promise<string> {
    const user = await authRepository.findUserById(userId);
    await otpService.verifyOTP(user.email, OTPPurpose.REAUTHENTICATION, otp);

    await auditService.log({
      userId,
      action: "REAUTH_OTP_SUCCESS",
    });

    return this.generateReauthToken(userId);
  }

  // --- Sensitive Operations ---
  public async changePassword(userId: string, newPasswordMask: string): Promise<void> {
    const passwordHash = await hashPassword(newPasswordMask);
    await authRepository.updateUserPassword(userId, passwordHash);
    
    // Revoke all active sessions for security when password changes
    await authRepository.revokeAllUserRefreshTokens(userId);

    await auditService.log({
      userId,
      action: "PASSWORD_CHANGED_SECURE",
    });
  }

  public async sendEmailChangeOTP(userId: string, newEmail: string): Promise<void> {
    // Pre-check email availability
    try {
      await authRepository.findUserByEmail(newEmail);
      throw new UserAlreadyExistsError("email");
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
    }

    const user = await authRepository.findUserById(userId);
    await otpService.sendOTP(newEmail, OTPPurpose.EMAIL_CHANGE, user.username);
  }

  public async verifyAndChangeEmail(userId: string, newEmail: string, otp: string): Promise<void> {
    // Verify OTP sent to the new email
    await otpService.verifyOTP(newEmail, OTPPurpose.EMAIL_CHANGE, otp);

    // Update email in database
    await db.query(
      `
        UPDATE users
        SET email = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [newEmail, userId]
    );

    await auditService.log({
      userId,
      action: "EMAIL_CHANGED_SECURE",
      metadata: { newEmail },
    });
  }

  public async deleteAccount(userId: string): Promise<void> {
    await db.query(
      `
        DELETE FROM users
        WHERE id = $1
      `,
      [userId]
    );

    await auditService.log({
      userId,
      action: "ACCOUNT_DELETED_SECURE",
    });
  }

  // --- Password Reset ---
  public async forgotPassword(email: string): Promise<void> {
    try {
      const user = await authRepository.findUserByEmail(email);
      // Send a password-reset OTP instead of a token link
      await otpService.sendOTP(user.email, OTPPurpose.PASSWORD_RESET, user.username);

      await auditService.log({
        userId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
      });
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
      console.log(`[Forgot Password] Requested for non-existent email: ${email}`);
    }
  }

  public async resetPassword(email: string, otp: string, passwordMask: string): Promise<void> {
    // Verify OTP first
    await otpService.verifyOTP(email, OTPPurpose.PASSWORD_RESET, otp);

    const user = await authRepository.findUserByEmail(email);
    const passwordHash = await hashPassword(passwordMask);
    await authRepository.updateUserPassword(user.id, passwordHash);
    
    // Revoke all active sessions for security
    await authRepository.revokeAllUserRefreshTokens(user.id);

    await auditService.log({
      userId: user.id,
      action: "PASSWORD_RESET_SUCCESS",
    });
  }

  // --- Verify Email ---
  public async verifyEmail(email: string, otp: string): Promise<void> {
    await otpService.verifyOTP(email, OTPPurpose.EMAIL_VERIFICATION, otp);

    // Find user and verify
    const user = await authRepository.findUserByEmail(email);
    await authRepository.verifyUser(user.id);
  }

  // --- Social Logins (Simulated) ---
  public async socialLogin(
    provider: "google" | "github",
    profile: { id: string; email: string; username: string },
    ipAddress?: string,
    userAgent?: string,
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

        await auditService.log({
          userId: user.id,
          action: "ACCOUNT_CREATED",
          metadata: { provider, method: "oauth" },
        });
      } else {
        throw err;
      }
    }

    return this.generateUserSession(user, ipAddress, userAgent);
  }

  // --- Refresh Session ---
  public async refresh(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
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
        
        await auditService.log({
          userId: tokenRecord.userId,
          action: "REFRESH_TOKEN_REUSE_DETECTED",
          ipAddress,
          userAgent,
        });

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
      refreshExpiresAt,
      ipAddress,
      userAgent
    );

    const newAccessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
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
        role: user.role,
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

  // --- Active Session Management ---
  public async getActiveSessions(userId: string): Promise<any[]> {
    return authRepository.findActiveSessionsForUser(userId);
  }

  public async revokeSession(tokenId: string, userId: string): Promise<void> {
    await authRepository.revokeSession(tokenId, userId);
    await auditService.log({
      userId,
      action: "SESSION_REVOKED",
      metadata: { revokedSessionId: tokenId },
    });
  }

  public async revokeOtherSessions(userId: string, currentTokenId: string): Promise<void> {
    await authRepository.revokeOtherSessions(userId, currentTokenId);
    await auditService.log({
      userId,
      action: "ALL_OTHER_SESSIONS_REVOKED",
    });
  }

  // --- Helper: Generate Session ---
  private async generateUserSession(
    user: UserRecord,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
    };

    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });

    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dbToken = await authRepository.createRefreshToken(
      user.id,
      refreshExpiresAt,
      ipAddress,
      userAgent
    );

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
export type { AuthService };
