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

    // Basic format check matching our validator regex
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

    // Check the Bloom Filter
    const maybeTaken = usernameBloomFilter.has(normalizedUsername);
    if (!maybeTaken) {
      return res.status(200).json({
        available: true,
        message: "Username is available.",
      });
    }

    // Query database to be certain (handles Bloom Filter false positives)
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
    const result = await authService.login(req.body);

    // If MFA is required or setup is required, return the MFA details
    if ("mfaRequired" in result || "mfaSetupRequired" in result) {
      return res.status(200).json({
        message: "MFA verification required.",
        data: result,
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

  public verify2FA = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { mfaToken, code } = req.body;
    if (typeof mfaToken !== "string" || typeof code !== "string") {
      return res.status(400).json({
        message: "MFA token and code are required.",
      });
    }

    const result = await authService.verify2FALogin(mfaToken, code);

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: "MFA verification successful.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  public verifySetup2FA = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { mfaToken, secret, code } = req.body;
    if (typeof mfaToken !== "string" || typeof secret !== "string" || typeof code !== "string") {
      return res.status(400).json({
        message: "MFA token, secret, and code are required.",
      });
    }

    const result = await authService.verifyAndSetup2FA(mfaToken, secret, code);

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      message: "MFA setup and verification successful.",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  public enable2FA = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const result = await authService.enable2FA(userId);

    return res.status(200).json({
      message: "TOTP secret generated. Verify to enable.",
      data: result,
    });
  });

  public verifyEnable2FA = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    const { secret, code } = req.body;

    if (typeof secret !== "string" || typeof code !== "string") {
      return res.status(400).json({
        message: "Secret and code are required.",
      });
    }

    await authService.verifyAndEnable2FA(userId, secret, code);

    return res.status(200).json({
      message: "Two-factor authentication enabled successfully.",
    });
  });

  public disable2FA = asyncHandler(async (
    req: any,
    res: Response,
  ) => {
    const userId = req.user.userId;
    await authService.disable2FA(userId);

    return res.status(200).json({
      message: "Two-factor authentication disabled successfully.",
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

    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null) || "http://localhost:3001";

    await authService.forgotPassword(email.trim(), origin);

    return res.status(200).json({
      message: "If the email exists, a password reset link has been sent.",
    });
  });

  public resetPassword = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const { token, password } = req.body;
    if (typeof token !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Token and password are required.",
      });
    }

    await authService.resetPassword(token, password);

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

    const result = await authService.socialLogin(provider, {
      id: `mock-${provider}-${Date.now()}`,
      email,
      username,
    });

    if ("mfaRequired" in result || "mfaSetupRequired" in result) {
      return res.status(200).json({
        message: "MFA verification required.",
        data: result,
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
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies["refreshToken"];

    if (!token) {
      return res.status(401).json({
        message: "Refresh token missing.",
      });
    }

    const result = await authService.refresh(token);

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
    req: Request,
    res: Response,
  ) => {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies["refreshToken"];

    if (token) {
      await authService.logout(token);
    }

    res.clearCookie("refreshToken", CLEAR_COOKIE_OPTIONS);

    return res.status(200).json({
      message: "Logged out successfully.",
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
