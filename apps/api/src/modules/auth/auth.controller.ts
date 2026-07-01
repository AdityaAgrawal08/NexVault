import type {
  Request,
  Response,
} from "express";

import { registerSchema } from "../../shared/validators/register.validator";
import { asyncHandler } from "../../shared/errors/async-handler";
import { authService } from "./auth.service";
import { usernameBloomFilter } from "./username-bloom-filter";
import { authRepository } from "./auth.repository";
import { emailWorker } from "../email/email.worker";
import { auditService } from "../audit/audit.service";
import { AppError } from "../../shared/errors/app-error";
import { verifyRefreshToken } from "../../core/security/jwt";
import { policyEngine } from "../../core/security/policy";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
};

// CSRF check for cookie-based endpoints
function verifyCSRF(req: Request) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  
  const target = origin || referer;
  if (target) {
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(target);
    if (!isLocalhost) {
      throw new AppError({
        message: "Action blocked by CSRF protection policy.",
        statusCode: 403,
        code: "AUTH_CSRF_BLOCK",
      });
    }
  }
}

class AuthController {
  public checkUsername = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { username } = req.query;

    if (typeof username !== "string" || !username.trim()) {
      return res.status(400).json({
        available: false,
        message: "Username query parameter is required.",
      });
    }

    const normalizedUsername = username.trim().toLowerCase();

    if (
      normalizedUsername.length < 3 ||
      normalizedUsername.length > 32 ||
      !/^[a-z0-9_]+$/.test(normalizedUsername)
    ) {
      return res.status(200).json({
        available: false,
        message: "Username must be 3-32 characters and contain only letters, numbers, and underscores.",
      });
    }

    const maybeTaken = usernameBloomFilter.has(normalizedUsername);
    if (!maybeTaken) {
      return res.status(200).json({
        available: true,
        message: "Username is available.",
      });
    }

    try {
      await authRepository.findUserByUsername(normalizedUsername);
      return res.status(200).json({
        available: false,
        message: "Username is already taken.",
      });
    } catch (error) {
      return res.status(200).json({
        available: true,
        message: "Username is available.",
      });
    }
  });

  public sendOTP = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { email } = req.body;
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        message: "Email is required.",
      });
    }

    await authService.sendOTP(email.trim());

    return res.status(200).json({
      message: "Verification code sent to your email.",
    });
  });

  public verifyEmail = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { email, otp } = req.body;
    if (typeof email !== "string" || typeof otp !== "string") {
      return res.status(400).json({
        message: "Email and OTP are required.",
      });
    }

    await authService.verifyEmail(email.trim(), otp.trim());

    return res.status(200).json({
      message: "Email verified successfully.",
    });
  });

  public register = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      throw result.error;
    }

    const user = await authService.register(result.data);

    return res
      .status(201)
      .location(`/users/${user.id}`)
      .json({
        message: "User created successfully.",
        data: user,
      });
  });

  public login = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const ip = req.ip || req.socket.remoteAddress || undefined;
    const ua = req.headers["user-agent"] || undefined;
    const fingerprint = req.headers["x-device-fingerprint"] as string | undefined;

    const result = await authService.login(req.body, ip, ua, fingerprint);

    if (result.sessionsRevoked) {
      return res.status(200).json({
        message: "All other sessions have been logged out. Please log in again.",
        code: "AUTH_CONCURRENT_SESSIONS_REVOKED",
      });
    }

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: "Login successful.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  public forgotPassword = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { email } = req.body;
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        message: "Email is required.",
      });
    }

    await authService.forgotPassword(email.trim());

    return res.status(200).json({
      message: "If the email exists, a verification code has been sent.",
    });
  });

  public resetPassword = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { email, otp, password } = req.body;
    if (typeof email !== "string" || typeof otp !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Email, OTP, and new password are required.",
      });
    }

    await authService.resetPassword(email.trim(), otp.trim(), password);

    return res.status(200).json({
      message: "Password has been reset successfully.",
    });
  });

  public socialLogin = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { provider, email, username } = req.body;

    if (!provider || !email || !username) {
      return res.status(400).json({
        message: "Provider, email, and username are required.",
      });
    }

    const ip = req.ip || req.socket.remoteAddress || undefined;
    const ua = req.headers["user-agent"] || undefined;
    const fingerprint = req.headers["x-device-fingerprint"] as string | undefined;

    const result = await authService.socialLogin(provider, {
      id: `mock-${provider}-${Date.now()}`,
      email,
      username,
    }, ip, ua, fingerprint);

    if (result.sessionsRevoked) {
      return res.status(200).json({
        message: "All other sessions have been logged out. Please log in again.",
        code: "AUTH_CONCURRENT_SESSIONS_REVOKED",
      });
    }

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: "Social login successful.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  public refresh = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    verifyCSRF(req);

    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies["refreshToken"];

    if (!token) {
      return res.status(401).json({
        message: "Refresh token missing.",
      });
    }

    const ip = req.ip || req.socket.remoteAddress || undefined;
    const ua = req.headers["user-agent"] || undefined;
    const fingerprint = req.headers["x-device-fingerprint"] as string | undefined;

    const result = await authService.refresh(token, ip, ua, fingerprint);

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: "Token refreshed successfully.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  public logout = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    verifyCSRF(req);

    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies["refreshToken"];
    const accessToken = req.token;

    if (token) {
      await authService.logout(token, accessToken);
    }

    res.clearCookie("refreshToken", CLEAR_COOKIE_OPTIONS);

    return res.status(200).json({
      message: "Logged out successfully.",
    });
  });

  // --- Re-authentication ---
  public reauthWithPassword = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const { password } = req.body;

    if (typeof password !== "string") {
      return res.status(400).json({ message: "Password is required." });
    }

    const reauthToken = await authService.reauthWithPassword(userId, password);

    return res.status(200).json({
      message: "Re-authentication successful.",
      data: { reauthToken },
    });
  });

  public sendReauthOTP = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    await authService.sendReauthOTP(userId);

    return res.status(200).json({
      message: "Re-authentication code sent to your registered email.",
    });
  });

  public verifyReauthOTP = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const { otp } = req.body;

    if (typeof otp !== "string") {
      return res.status(400).json({ message: "Verification code is required." });
    }

    const reauthToken = await authService.verifyReauthOTP(userId, otp);

    return res.status(200).json({
      message: "Re-authentication successful.",
      data: { reauthToken },
    });
  });

  // --- Sensitive Operations (Enforced by reauthMiddleware) ---
  public changePassword = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const { newPassword } = req.body;
    const accessToken = req.token;

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters long.",
      });
    }

    await authService.changePassword(userId, newPassword, accessToken);

    return res.status(200).json({
      message: "Password changed successfully. All other sessions have been revoked.",
    });
  });

  public sendEmailChangeOTP = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const { newEmail } = req.body;

    if (typeof newEmail !== "string" || !newEmail.includes("@")) {
      return res.status(400).json({
        message: "A valid new email address is required.",
      });
    }

    await authService.sendEmailChangeOTP(userId, newEmail);

    return res.status(200).json({
      message: "Verification code sent to the new email address.",
    });
  });

  public verifyAndChangeEmail = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const { newEmail, otp } = req.body;

    if (typeof newEmail !== "string" || typeof otp !== "string") {
      return res.status(400).json({
        message: "New email and verification code are required.",
      });
    }

    await authService.verifyAndChangeEmail(userId, newEmail, otp);

    return res.status(200).json({
      message: "Email address updated successfully.",
    });
  });

  public requestAccountDeletion = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    await authService.requestAccountDeletion(userId);

    return res.status(200).json({
      message: "A verification code has been sent to your email to confirm account deletion.",
    });
  });

  public confirmAccountDeletion = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const { otp } = req.body;
    const accessToken = req.token;

    if (typeof otp !== "string") {
      return res.status(400).json({ message: "Verification code is required." });
    }

    await authService.confirmAccountDeletion(userId, otp, accessToken);

    res.clearCookie("refreshToken", CLEAR_COOKIE_OPTIONS);

    return res.status(200).json({
      message: "Account successfully scheduled for deletion. You have been logged out.",
    });
  });

  public recoverAccount = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { email, otp, newPassword } = req.body;
    if (typeof email !== "string" || typeof otp !== "string") {
      return res.status(400).json({
        message: "Email and verification code are required.",
      });
    }

    const ip = req.ip || req.socket.remoteAddress || undefined;
    const ua = req.headers["user-agent"] || undefined;
    const fingerprint = req.headers["x-device-fingerprint"] as string | undefined;

    const result = await authService.recoverAccount(email, otp, newPassword, ip, ua, fingerprint);

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: "Account recovered successfully.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  // --- Active Session Management ---
  public getSessions = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    
    // Centralized Policy Check
    policyEngine.check(req.user, "view_sessions", userId);

    const sessions = await authService.getActiveSessions(userId);
    
    const sessionsWithMetadata = sessions.map((s) => {
      const ua = s.userAgent || "";
      let browser = "Unknown Browser";
      let os = "Unknown OS";

      if (ua.includes("Firefox")) browser = "Firefox";
      else if (ua.includes("Chrome")) browser = "Chrome";
      else if (ua.includes("Safari")) browser = "Safari";
      else if (ua.includes("Edge")) browser = "Edge";

      if (ua.includes("Windows")) os = "Windows";
      else if (ua.includes("Macintosh")) os = "macOS";
      else if (ua.includes("Linux")) os = "Linux";
      else if (ua.includes("Android")) os = "Android";
      else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

      return {
        id: s.id,
        ipAddress: s.ipAddress || "Unknown IP",
        browser,
        os,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      };
    });

    return res.status(200).json({
      message: "Active sessions retrieved successfully.",
      data: sessionsWithMetadata,
    });
  });

  public revokeSession = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        message: "Session ID is required.",
      });
    }

    // Fetch session first to verify owner
    const tokenRecord = await authRepository.findRefreshTokenById(sessionId);
    if (!tokenRecord) {
      throw new AppError({
        message: "Session not found.",
        statusCode: 404,
        code: "AUTH_SESSION_NOT_FOUND",
      });
    }

    // Centralized Policy Check
    policyEngine.check(req.user, "revoke_session", tokenRecord.userId);

    await authService.revokeSession(sessionId, tokenRecord.userId);

    return res.status(200).json({
      message: "Session revoked successfully.",
    });
  });

  public revokeOtherSessions = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    
    // Centralized Policy Check
    policyEngine.check(req.user, "manage_sessions", userId);

    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies["refreshToken"];

    if (!token) {
      throw new AppError({
        message: "Refresh token is missing.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_INVALID",
      });
    }

    const payload = verifyRefreshToken(token);
    await authService.revokeOtherSessions(userId, payload.tokenId);

    return res.status(200).json({
      message: "All other sessions revoked successfully.",
    });
  });

  // --- Security Audit Logs ---
  public getAuditLogs = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;

    let logs: any[];
    if (policyEngine.can(req.user, "view_audit_logs")) {
      logs = await auditService.getAllLogs();
    } else {
      // Centralized Policy Check for self-access
      policyEngine.check(req.user, "view_profile", userId);
      logs = await auditService.getLogsForUser(userId);
    }

    return res.status(200).json({
      message: "Audit logs retrieved successfully.",
      data: logs,
    });
  });

  public getEmailMetrics = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const metrics = await emailWorker.getMetrics();
    return res.status(200).json({
      message: "Email metrics retrieved successfully.",
      data: metrics,
    });
  });
}

export const authController = new AuthController();
export type { AuthController };
