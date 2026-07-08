import pg, { DatabaseError, PoolClient } from "pg";
import crypto from "crypto";

import { db } from "../../core/database/postgres";

import {
  CreateUserInput,
  CreateUserResult,
  UserRecord,
} from "./auth.types";

import {
  UserAlreadyExistsError,
  UserNotFoundError,
} from "./auth.errors";

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  isRevoked: boolean;
  replacedBy: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  revocationReason: string | null;
  sessionId: string;
  revokedAt: Date | null;
}

export class AuthRepository {
  public async createUser(
    input: CreateUserInput,
    client?: PoolClient,
  ): Promise<CreateUserResult> {
    const {
      username,
      email,
      phoneNumber,
      passwordHash,
    } = input;

    const dbClient = (client || db) as any;

    try {
      // Determine role: if username is "Admin" or "aditya", make them ADMIN
      const role = (username.toLowerCase() === "admin" || username.toLowerCase() === "aditya") ? "ADMIN" : "USER";

      const { rows } = await dbClient.query(
        `
          INSERT INTO users (
            username,
            email,
            phone_number,
            password,
            is_verified,
            role
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            FALSE,
            $5
          )
          RETURNING
            id,
            username,
            email,
            phone_number AS "phoneNumber",
            role,
            created_at AS "createdAt"
        `,
        [
          username,
          email,
          phoneNumber,
          passwordHash,
          role,
        ],
      );

      const user = rows[0];

      if (!user) {
        throw new Error(
          "INSERT succeeded but returned no rows.",
        );
      }

      return user;
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === "23505"
      ) {
        switch (error.constraint) {
          case "users_username_key":
            throw new UserAlreadyExistsError("username");

          case "users_email_key":
            throw new UserAlreadyExistsError("email");

          case "users_phone_number_key":
            throw new UserAlreadyExistsError("phoneNumber");

          default:
            throw error;
        }
      }

      throw error;
    }
  }

  public async findUserById(
    id: string,
  ): Promise<UserRecord> {
    const { rows } = await db.readQuery<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          is_verified AS "isVerified",
          two_factor_secret AS "twoFactorSecret",
          two_factor_enabled AS "twoFactorEnabled",
          role,
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          deleted_at AS "deletedAt",
          deletion_scheduled_for AS "deletionScheduledFor",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async findUserByEmail(
    email: string,
  ): Promise<UserRecord> {
    const { rows } = await db.readQuery<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          is_verified AS "isVerified",
          two_factor_secret AS "twoFactorSecret",
          two_factor_enabled AS "twoFactorEnabled",
          role,
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          deleted_at AS "deletedAt",
          deletion_scheduled_for AS "deletionScheduledFor",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async findUserByUsername(
    username: string,
  ): Promise<UserRecord> {
    const { rows } = await db.readQuery<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          is_verified AS "isVerified",
          two_factor_secret AS "twoFactorSecret",
          two_factor_enabled AS "twoFactorEnabled",
          role,
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          deleted_at AS "deletedAt",
          deletion_scheduled_for AS "deletionScheduledFor",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [username],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async findUserByPhone(
    phoneNumber: string,
  ): Promise<UserRecord> {
    const { rows } = await db.readQuery<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          is_verified AS "isVerified",
          two_factor_secret AS "twoFactorSecret",
          two_factor_enabled AS "twoFactorEnabled",
          role,
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          deleted_at AS "deletedAt",
          deletion_scheduled_for AS "deletionScheduledFor",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE phone_number = $1
        LIMIT 1
      `,
      [phoneNumber],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async updateUserPassword(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await db.query(
      `
        UPDATE users
        SET password = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [passwordHash, userId],
    );
  }

  public async getAllUsernames(): Promise<string[]> {
    const { rows } = await db.readQuery<{ username: string }>(
      `SELECT username FROM users`
    );
    return rows.map((row) => row.username);
  }

  // --- Lockout Management ---
  public async incrementFailedAttempts(
    userId: string,
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    const { rows } = await db.query<any>(
      `
        UPDATE users
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE 
              WHEN failed_login_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
              ELSE NULL
            END
        WHERE id = $1
        RETURNING failed_login_attempts AS "failedLoginAttempts", locked_until AS "lockedUntil"
      `,
      [userId]
    );
    return rows[0];
  }

  public async resetFailedAttempts(userId: string): Promise<void> {
    await db.query(
      `
        UPDATE users
        SET failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = $1
      `,
      [userId]
    );
  }

  // --- Refresh Token & Session Management ---
  // --- Refresh Token & Session Management ---
  public async createRefreshToken(
    userId: string,
    expiresAt: Date,
    ipAddress?: string | null,
    userAgent?: string | null,
    deviceFingerprint?: string | null,
    sessionId?: string | null,
  ): Promise<{ id: string; sessionId: string; rawToken: string }> {
    const rawToken = crypto.randomBytes(40).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const activeSessionId = sessionId || crypto.randomUUID();

    const { rows } = await db.query<{ id: string }>(
      `
        INSERT INTO refresh_tokens (
          user_id,
          token_hash,
          expires_at,
          ip_address,
          user_agent,
          device_fingerprint,
          session_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
      [userId, tokenHash, expiresAt, ipAddress || null, userAgent || null, deviceFingerprint || null, activeSessionId],
    );

    const firstRow = rows[0];
    if (!firstRow) {
      throw new Error("Failed to create refresh token.");
    }

    return {
      id: firstRow.id,
      sessionId: activeSessionId,
      rawToken,
    };
  }

  public async findRefreshTokenByHash(
    rawToken: string,
  ): Promise<RefreshTokenRecord | null> {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const { rows } = await db.readQuery<any>(
      `
        SELECT
          id,
          user_id AS "userId",
          token_hash AS "tokenHash",
          expires_at AS "expiresAt",
          created_at AS "createdAt",
          is_revoked AS "isRevoked",
          replaced_by AS "replacedBy",
          ip_address AS "ipAddress",
          user_agent AS "userAgent",
          device_fingerprint AS "deviceFingerprint",
          revocation_reason AS "revocationReason",
          session_id AS "sessionId",
          revoked_at AS "revokedAt"
        FROM refresh_tokens
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    return rows[0] || null;
  }

  public async findRefreshTokenById(
    id: string,
  ): Promise<RefreshTokenRecord | null> {
    const { rows } = await db.readQuery<any>(
      `
        SELECT
          id,
          user_id AS "userId",
          token_hash AS "tokenHash",
          expires_at AS "expiresAt",
          created_at AS "createdAt",
          is_revoked AS "isRevoked",
          replaced_by AS "replacedBy",
          ip_address AS "ipAddress",
          user_agent AS "userAgent",
          device_fingerprint AS "deviceFingerprint",
          revocation_reason AS "revocationReason",
          session_id AS "sessionId",
          revoked_at AS "revokedAt"
        FROM refresh_tokens
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    return rows[0] || null;
  }

  public async revokeRefreshToken(id: string, reason?: string): Promise<void> {
    await db.query(
      `
        UPDATE refresh_tokens
        SET is_revoked = TRUE, revocation_reason = $2, revoked_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [id, reason || null],
    );
  }

  public async revokeAllUserRefreshTokens(userId: string, reason?: string): Promise<void> {
    await db.query(
      `
        UPDATE refresh_tokens
        SET is_revoked = TRUE, revocation_reason = $2, revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `,
      [userId, reason || null],
    );
  }

  public async replaceRefreshToken(
    oldTokenId: string,
    userId: string,
    expiresAt: Date,
    ipAddress?: string | null,
    userAgent?: string | null,
    deviceFingerprint?: string | null,
  ): Promise<{ id: string; sessionId: string; rawToken: string }> {
    const rawToken = crypto.randomBytes(40).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 1. Get the session_id from the old token
      const oldTokenRes = await client.query(
        `SELECT session_id FROM refresh_tokens WHERE id = $1`,
        [oldTokenId]
      );
      const sessionId = oldTokenRes.rows[0]?.session_id || oldTokenId;

      const { rows } = await client.query<{ id: string }>(
        `
          INSERT INTO refresh_tokens (
            user_id,
            token_hash,
            expires_at,
            ip_address,
            user_agent,
            device_fingerprint,
            session_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
        [userId, tokenHash, expiresAt, ipAddress || null, userAgent || null, deviceFingerprint || null, sessionId],
      );
      const firstRow = rows[0];
      if (!firstRow) {
        throw new Error("Failed to create refresh token during replacement.");
      }
      const newTokenId = firstRow.id;

      await client.query(
        `
          UPDATE refresh_tokens
          SET is_revoked = TRUE,
              replaced_by = $1,
              revoked_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
        [newTokenId, oldTokenId],
      );

      await client.query("COMMIT");

      return {
        id: newTokenId,
        sessionId,
        rawToken,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async findActiveSessionsForUser(userId: string): Promise<any[]> {
    const { rows } = await db.readQuery(
      `
        SELECT
          session_id AS "id",
          ip_address AS "ipAddress",
          user_agent AS "userAgent",
          device_fingerprint AS "deviceFingerprint",
          created_at AS "createdAt",
          expires_at AS "expiresAt"
        FROM refresh_tokens
        WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > NOW()
        ORDER BY created_at DESC
      `,
      [userId]
    );
    return rows;
  }

  public async revokeSession(tokenId: string, userId: string): Promise<void> {
    await db.query(
      `
        UPDATE refresh_tokens
        SET is_revoked = TRUE, revoked_at = CURRENT_TIMESTAMP, revocation_reason = 'REVOKED_BY_USER'
        WHERE (id = $1 OR session_id = $1) AND user_id = $2
      `,
      [tokenId, userId]
    );
  }

  public async revokeSessionById(sessionId: string, userId: string): Promise<void> {
    await db.query(
      `
        UPDATE refresh_tokens
        SET is_revoked = TRUE, revoked_at = CURRENT_TIMESTAMP, revocation_reason = 'REVOKED_BY_USER'
        WHERE (session_id = $1 OR id = $1) AND user_id = $2
      `,
      [sessionId, userId]
    );
  }

  public async revokeOtherSessions(userId: string, currentTokenId: string): Promise<void> {
    // Revoke by finding the current token's session_id, and revoking all other session_ids!
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const currentTokenRes = await client.query(
        `SELECT session_id FROM refresh_tokens WHERE id = $1`,
        [currentTokenId]
      );
      const currentSessionId = currentTokenRes.rows[0]?.session_id || currentTokenId;

      await client.query(
        `
          UPDATE refresh_tokens
          SET is_revoked = TRUE, revoked_at = CURRENT_TIMESTAMP, revocation_reason = 'REVOKED_BY_USER'
          WHERE user_id = $1 AND session_id <> $2
        `,
        [userId, currentSessionId]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // OTP Management
  public async createOTP(
    email: string,
    otp: string,
    expiresAt: Date,
  ): Promise<void> {
    await db.query(
      `
        INSERT INTO otps (email, otp, expires_at)
        VALUES ($1, $2, $3)
      `,
      [email, otp, expiresAt],
    );
  }

  public async findLatestOTP(
    email: string,
  ): Promise<{ otp: string; expiresAt: Date; createdAt: Date } | null> {
    const { rows } = await db.readQuery<any>(
      `
        SELECT otp, expires_at AS "expiresAt", created_at AS "createdAt"
        FROM otps
        WHERE email = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [email],
    );
    return rows[0] || null;
  }

  public async deleteOTPsForEmail(email: string): Promise<void> {
    await db.query(
      `
        DELETE FROM otps
        WHERE email = $1
      `,
      [email],
    );
  }

  // Password Reset Management
  public async createPasswordReset(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<void> {
    await db.query(
      `
        INSERT INTO password_resets (user_id, token, expires_at)
        VALUES ($1, $2, $3)
      `,
      [userId, token, expiresAt],
    );
  }

  public async findPasswordResetByToken(
    token: string,
  ): Promise<{ userId: string; expiresAt: Date } | null> {
    const { rows } = await db.readQuery<any>(
      `
        SELECT user_id AS "userId", expires_at AS "expiresAt"
        FROM password_resets
        WHERE token = $1
        LIMIT 1
      `,
      [token],
    );
    return rows[0] || null;
  }

  public async deletePasswordReset(token: string): Promise<void> {
    await db.query(
      `
        DELETE FROM password_resets
        WHERE token = $1
      `,
      [token],
    );
  }

  public async verifyUser(userId: string): Promise<void> {
    await db.query(
      `
        UPDATE users
        SET is_verified = TRUE
        WHERE id = $1
      `,
      [userId],
    );
  }

  public async update2FA(
    userId: string,
    enabled: boolean,
    secret: string | null,
  ): Promise<void> {
    await db.query(
      `
        UPDATE users
        SET two_factor_enabled = $1,
            two_factor_secret = $2
        WHERE id = $3
      `,
      [enabled, secret, userId],
    );
  }

  public async scheduleAccountDeletion(userId: string, scheduledFor: Date): Promise<void> {
    await db.query(
      `
        UPDATE users
        SET deleted_at = NOW(),
            deletion_scheduled_for = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [scheduledFor, userId]
    );
  }

  public async cancelAccountDeletion(userId: string): Promise<void> {
    await db.query(
      `
        UPDATE users
        SET deleted_at = NULL,
            deletion_scheduled_for = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [userId]
    );
  }

  public async updateUserProfile(
    userId: string,
    username: string,
    phoneNumber: string,
  ): Promise<void> {
    await db.query(
      `
        UPDATE users
        SET username = $1,
            phone_number = $2,
            updated_at = NOW()
        WHERE id = $3
      `,
      [username, phoneNumber, userId]
    );
  }
}

export const authRepository = new AuthRepository();
