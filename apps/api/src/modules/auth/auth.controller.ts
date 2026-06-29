import type {
  Request,
  Response,
} from "express";

import { registerSchema } from "../../shared/validators/register.validator";
import { asyncHandler } from "../../shared/errors/async-handler";
import { authService } from "./auth.service";
import { usernameBloomFilter } from "./username-bloom-filter";
import { authRepository } from "./auth.repository";

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

  public register = asyncHandler(async (
    req: Request,
    res: Response,
  ) => {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      throw result.error;
    }

    const user = await authService.register(result.data);

    res
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
    const user = await authService.login(req.body);

    res.status(200).json({
      message: "Login successful.",
      data: user,
    });
  });
}

export const authController = new AuthController();

