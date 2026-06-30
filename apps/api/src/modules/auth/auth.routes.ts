import { Router } from "express";

import { authController } from "./auth.controller";
import { authMiddleware } from "../../core/security/auth.middleware";
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
  "/verify-2fa",
  authLimiter,
  authController.verify2FA.bind(authController),
);

router.post(
  "/verify-setup-2fa",
  authLimiter,
  authController.verifySetup2FA.bind(authController),
);

router.post(
  "/enable-2fa",
  authMiddleware,
  authController.enable2FA.bind(authController),
);

router.post(
  "/verify-enable-2fa",
  authMiddleware,
  authController.verifyEnable2FA.bind(authController),
);

router.post(
  "/disable-2fa",
  authMiddleware,
  authController.disable2FA.bind(authController),
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

router.get(
  "/metrics/email",
  authController.getEmailMetrics.bind(authController),
);

export default router;
