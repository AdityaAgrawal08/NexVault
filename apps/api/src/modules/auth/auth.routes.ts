import { Router } from "express";

import { authController } from "./auth.controller";

const router = Router();

router.get(
  "/check-username",
  authController.checkUsername.bind(authController),
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
  "/refresh",
  authController.refresh.bind(authController),
);

router.post(
  "/logout",
  authController.logout.bind(authController),
);

export default router;
