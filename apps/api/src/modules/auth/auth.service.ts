import crypto from "crypto";
import jwt from "jsonwebtoken";
import { PoolClient } from "pg";

import {
  hashPassword,
  verifyPassword,
} from "../../core/security/password";

import { authRepository } from "./auth.repository";
import { db } from "../../core/database/postgres";
import { usernameBloomFilter } from "./username-bloom-filter";
import { sessionStore } from "./session.store";
import { tokenBlocklistStore } from "../../core/security/blocklist.store";
import { pwnedPasswordService } from "../../core/security/pwned.service";
import { lockService } from "../../core/security/lock.service";

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
  // --- Device Fingerprint Helper ---
  private getDeviceFingerprintHash(
    userAgent?: string,
    ipAddress?: string,
    headerFingerprint?: string,
  ): string {
    if (headerFingerprint) {
      return crypto.createHash("sha256").update(headerFingerprint).digest("hex");
    }
    const ua = userAgent || "unknown-ua";
    const ip = ipAddress || "unknown-ip";
    // Mask IP to subnet level to prevent minor IP changes from blocking the user
    const ipSubnet = ip.split(".").slice(0, 3).join(".");
    return crypto.createHash("sha256").update(`${ua}:${ipSubnet}`).digest("hex");
  }

  // --- Access Token Blocklisting Helper ---
  public async blocklistAccessToken(token: string): Promise<void> {
    try {
      const parts = token.split(".");
      const signature = parts[2];
      if (!signature) return;

      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        const ttlSeconds = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
        await tokenBlocklistStore.blocklistToken(signature, ttlSeconds);
      }
    } catch (err) {
      console.error("[AuthService] Failed to blocklist access token:", err);
    }
  }

  // --- OTP Verification ---
  public async sendOTP(email: string): Promise<void> {
    await otpService.sendOTP(email, OTPPurpose.EMAIL_VERIFICATION);
  }

  public async register(
    input: RegisterUserRequest & { otp: string },
  ): Promise<RegisterUserResponse> {
    const lockKey = `lock:register:${input.username.toLowerCase()}`;
    const lockToken = await lockService.acquireLock(lockKey, 5000);

    if (!lockToken) {
      throw new AppError({
        message: "Registration is currently in progress for this username. Please try again in a few seconds.",
        statusCode: 429,
        code: "AUTH_CONCURRENT_REGISTER",
      });
    }

    try {
      // 1. Check if password has been breached (HaveIBeenPwned)
      const isBreached = await pwnedPasswordService.isPasswordBreached(input.password);
      if (isBreached) {
        throw new AppError({
          message: "This password has been found in a database of breached passwords and is unsafe to use. Please choose a stronger password.",
          statusCode: 400,
          code: "AUTH_PASSWORD_BREACHED",
        });
      }

      // 2. Verify OTP
      await otpService.verifyOTP(input.email, OTPPurpose.EMAIL_VERIFICATION, input.otp);

      const passwordHash = await hashPassword(input.password);

      const createUserInput: CreateUserInput = {
        username: input.username,
        email: input.email,
        phoneNumber: input.phoneNumber,
        passwordHash,
      };

      // 3. Perform Atomic Registration within a transaction
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        // Attempt user creation (will throw UserAlreadyExistsError on unique violation)
        const user = await authRepository.createUser(createUserInput, client);
        
        // Verify user immediately
        await client.query(
          `UPDATE users SET is_verified = TRUE WHERE id = $1`,
          [user.id]
        );

        // Log registration
        await client.query(
          `
            INSERT INTO audit_logs (user_id, action, metadata)
            VALUES ($1, $2, $3)
          `,
          [
            user.id,
            "ACCOUNT_CREATED",
            JSON.stringify({ username: user.username, email: user.email }),
          ]
        );

        await client.query("COMMIT");

        // 4. Post-transaction operations
        await emailService.enqueue(user.email, EmailType.WELCOME, {
          username: user.username,
        });

        usernameBloomFilter.add(user.username.toLowerCase());
        return user;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await lockService.releaseLock(lockKey, lockToken);
    }
  }

  // --- Login & Session ---
  public async login(
    input: LoginRequest,
    ipAddress?: string,
    userAgent?: string,
    deviceFingerprint?: string,
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

    return this.generateUserSession(user, ipAddress, userAgent, deviceFingerprint);
  }

  // --- Re-authentication ---
  private generateReauthToken(userId: string): string {
    return jwt.sign(
      { userId, type: "reauth" },
      JWT_SECRET,
      { expiresIn: "5m" }
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
  public async changePassword(userId: string, newPasswordMask: string, activeAccessToken?: string): Promise<void> {
    // Check if new password is breached
    const isBreached = await pwnedPasswordService.isPasswordBreached(newPasswordMask);
    if (isBreached) {
      throw new AppError({
        message: "This password has been found in a database of breached passwords and is unsafe to use. Please choose a stronger password.",
        statusCode: 400,
        code: "AUTH_PASSWORD_BREACHED",
      });
    }

    const passwordHash = await hashPassword(newPasswordMask);
    await authRepository.updateUserPassword(userId, passwordHash);
    
    // Revoke all active sessions via Pluggable Session Store
    await sessionStore.invalidateAllUserSessions(userId);

    // Blocklist the current access token
    if (activeAccessToken) {
      await this.blocklistAccessToken(activeAccessToken);
    }

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
    // Check if new password is breached
    const isBreached = await pwnedPasswordService.isPasswordBreached(passwordMask);
    if (isBreached) {
      throw new AppError({
        message: "This password has been found in a database of breached passwords and is unsafe to use. Please choose a stronger password.",
        statusCode: 400,
        code: "AUTH_PASSWORD_BREACHED",
      });
    }

    // Verify OTP first
    await otpService.verifyOTP(email, OTPPurpose.PASSWORD_RESET, otp);

    const user = await authRepository.findUserByEmail(email);
    const passwordHash = await hashPassword(passwordMask);
    await authRepository.updateUserPassword(user.id, passwordHash);
    
    // Revoke all active sessions via Pluggable Session Store
    await sessionStore.invalidateAllUserSessions(user.id);

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
    deviceFingerprint?: string,
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

        // 1. Concurrency-Safe Username Generation Bounded Loop
        let username = profile.username;
        let created: any = null;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          try {
            created = await authRepository.createUser({
              username,
              email: profile.email,
              phoneNumber: phone,
              passwordHash,
            });
            break; // Success!
          } catch (createErr) {
            if (createErr instanceof UserAlreadyExistsError && createErr.field === "username") {
              attempts++;
              username = `${profile.username}_${crypto.randomBytes(4).toString("hex")}`;
            } else {
              throw createErr; // Email/phone clash or other error, propagate immediately
            }
          }
        }

        if (!created) {
          throw new AppError({
            message: "Could not allocate a unique username after 5 attempts.",
            statusCode: 409,
            code: "AUTH_USERNAME_ALLOCATION_FAILED",
          });
        }

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

    return this.generateUserSession(user, ipAddress, userAgent, deviceFingerprint);
  }

  // --- Refresh Session ---
  public async refresh(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
    deviceFingerprint?: string,
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
    
    // 1. Detect Refresh Token Reuse (RTR Violation / Theft)
    if (tokenRecord && (tokenRecord.isRevoked || tokenRecord.replacedBy)) {
      const user = await authRepository.findUserById(tokenRecord.userId);
      
      // Revoke ALL sessions immediately
      await sessionStore.invalidateAllUserSessions(user.id);

      // Log critical security alert
      await auditService.log({
        userId: user.id,
        action: "REFRESH_TOKEN_REUSE_ALERT",
        ipAddress,
        userAgent,
        metadata: { attemptedTokenId: tokenRecord.id },
      });

      // Send critical email alert
      await emailService.enqueue(user.email, EmailType.SECURITY_ALERT, {
        username: user.username,
        alertMessage: "A security threat was detected. An expired or reused session token was presented for authentication. For your safety, all active sessions on all devices have been terminated.",
        ipAddress: ipAddress || "Unknown",
      });

      throw new AppError({
        message: "Security violation detected. Please log in again.",
        statusCode: 401,
        code: "AUTH_SESSION_REVOKED_SECURITY",
      });
    }

    if (!tokenRecord) {
      throw new AppError({
        message: "Refresh token not found.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_NOT_FOUND",
      });
    }

    // 2. Validate Device Fingerprint to Prevent Session Hijacking
    const currentFingerprintHash = this.getDeviceFingerprintHash(userAgent, ipAddress, deviceFingerprint);
    if (tokenRecord.deviceFingerprint && tokenRecord.deviceFingerprint !== currentFingerprintHash) {
      const user = await authRepository.findUserById(tokenRecord.userId);

      // Session hijacking suspected: revoke ALL sessions
      await sessionStore.invalidateAllUserSessions(user.id);

      await auditService.log({
        userId: user.id,
        action: "SESSION_HIJACK_SUSPECTED",
        ipAddress,
        userAgent,
        metadata: {
          tokenId: tokenRecord.id,
          expectedFingerprint: tokenRecord.deviceFingerprint,
          actualFingerprint: currentFingerprintHash,
        },
      });

      await emailService.enqueue(user.email, EmailType.SECURITY_ALERT, {
        username: user.username,
        alertMessage: "A suspicious change in device signature was detected. To protect your account from hijacking, we have logged out all sessions.",
        ipAddress: ipAddress || "Unknown",
      });

      throw new AppError({
        message: "Session signature mismatch. Access denied.",
        statusCode: 401,
        code: "AUTH_SESSION_HIJACK_DETECTED",
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
      userAgent,
      currentFingerprintHash
    );

    // Cache new session in Redis
    await sessionStore.cacheSession(
      newToken.id,
      user.id,
      refreshExpiresAt,
      ipAddress,
      userAgent,
      currentFingerprintHash
    );

    const newAccessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tokenId: newToken.id,
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

  public async logout(refreshToken: string, accessToken?: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await sessionStore.invalidateSession(payload.tokenId);

      if (accessToken) {
        await this.blocklistAccessToken(accessToken);
      }
    } catch (err) {
      // Already cleared
    }
  }

  // --- Active Session Management ---
  public async getActiveSessions(userId: string): Promise<any[]> {
    return authRepository.findActiveSessionsForUser(userId);
  }

  public async revokeSession(tokenId: string, userId: string): Promise<void> {
    await sessionStore.invalidateSession(tokenId);
    await auditService.log({
      userId,
      action: "SESSION_REVOKED",
      metadata: { revokedSessionId: tokenId },
    });
  }

  public async revokeOtherSessions(userId: string, currentTokenId: string): Promise<void> {
    await sessionStore.invalidateOtherSessions(userId, currentTokenId);
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
    deviceFingerprint?: string,
  ): Promise<LoginResult> {
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
    };

    const fingerprintHash = this.getDeviceFingerprintHash(userAgent, ipAddress, deviceFingerprint);

    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dbToken = await authRepository.createRefreshToken(
      user.id,
      refreshExpiresAt,
      ipAddress,
      userAgent,
      fingerprintHash
    );

    // Cache the session in the Pluggable Session Store (Redis write-through)
    await sessionStore.cacheSession(
      dbToken.id,
      user.id,
      refreshExpiresAt,
      ipAddress,
      userAgent,
      fingerprintHash
    );

    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tokenId: dbToken.id,
    });

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
