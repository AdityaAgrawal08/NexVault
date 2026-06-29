import { Router } from "express";

import { authController } from "./auth.controller";
import { authMiddleware } from "../../core/security/auth.middleware";

const router = Router();

router.get(
  "/check-username",
  authController.checkUsername.bind(authController),
);

router.post(
  "/send-otp",
  authController.sendOTP.bind(authController),
);

router.post(
  "/verify-email",
  authController.verifyEmail.bind(authController),
);

router.post(
  "/register",
  authController.register.bind(authController),
);

router.post(
  "/login",
  authController.login.bind(authController),
);

router.post(
  "/verify-2fa",
  authController.verify2FA.bind(authController),
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
  authController.forgotPassword.bind(authController),
);

router.post(
  "/reset-password",
  authController.resetPassword.bind(authController),
);

router.post(
  "/oauth/login",
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

export default router;
