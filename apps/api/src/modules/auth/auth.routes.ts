import { Router } from "express";

import { authController } from "./auth.controller";
import { authMiddleware } from "../../core/security/auth.middleware";
import { reauthMiddleware } from "../../core/security/reauth.middleware";
import { rateLimiter } from "../../shared/middleware/rate-limiter.middleware";

const router = Router();

// Strict Rate Limiter for Authentication & Security Endpoints: 10 requests per minute per IP
const authLimiter = rateLimiter(60000, 10);

router.get(
  "/check-username",
  authController.checkUsername.bind(authController),
);

router.post(
  "/send-otp",
  authLimiter,
  authController.sendOTP.bind(authController),
);

router.post(
  "/verify-email",
  authLimiter,
  authController.verifyEmail.bind(authController),
);

router.post(
  "/register",
  authLimiter,
  authController.register.bind(authController),
);

router.post(
  "/login",
  authLimiter,
  authController.login.bind(authController),
);

router.post(
  "/forgot-password",
  authLimiter,
  authController.forgotPassword.bind(authController),
);

router.post(
  "/reset-password",
  authLimiter,
  authController.resetPassword.bind(authController),
);

router.post(
  "/recover",
  authLimiter,
  authController.recoverAccount.bind(authController),
);

router.post(
  "/oauth/login",
  authLimiter,
  authController.socialLogin.bind(authController),
);

router.post(
  "/refresh",
  authController.refresh.bind(authController),
);

router.post(
  "/logout",
  authController.logout.bind(authController),
);

// --- Re-authentication ---
router.post(
  "/reauth/password",
  authMiddleware,
  authController.reauthWithPassword.bind(authController),
);

router.post(
  "/reauth/otp/send",
  authMiddleware,
  authController.sendReauthOTP.bind(authController),
);

router.post(
  "/reauth/otp/verify",
  authMiddleware,
  authController.verifyReauthOTP.bind(authController),
);

// --- Sensitive Operations (Require Re-authentication) ---
router.post(
  "/profile/change-password",
  authMiddleware,
  reauthMiddleware,
  authController.changePassword.bind(authController),
);

router.post(
  "/profile/change-email/send-otp",
  authMiddleware,
  reauthMiddleware,
  authController.sendEmailChangeOTP.bind(authController),
);

router.post(
  "/profile/change-email/verify",
  authMiddleware,
  reauthMiddleware,
  authController.verifyAndChangeEmail.bind(authController),
);

router.post(
  "/profile/delete/request",
  authMiddleware,
  reauthMiddleware,
  authController.requestAccountDeletion.bind(authController),
);

router.post(
  "/profile/delete/confirm",
  authMiddleware,
  reauthMiddleware,
  authController.confirmAccountDeletion.bind(authController),
);

router.post(
  "/sessions/revoke-others",
  authMiddleware,
  reauthMiddleware,
  authController.revokeOtherSessions.bind(authController),
);

// --- Active Session Management ---
router.get(
  "/sessions",
  authMiddleware,
  authController.getSessions.bind(authController),
);

router.delete(
  "/sessions/:sessionId",
  authMiddleware,
  authController.revokeSession.bind(authController),
);

// --- Security Audit Logs ---
router.get(
  "/audit-logs",
  authMiddleware,
  authController.getAuditLogs.bind(authController),
);

router.get(
  "/metrics/email",
  authController.getEmailMetrics.bind(authController),
);

export default router;
