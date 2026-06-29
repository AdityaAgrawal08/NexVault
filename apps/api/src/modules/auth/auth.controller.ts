import type {
  Request,
  Response,
} from "express";

import { registerSchema } from "../../shared/validators/register.validator";

import { asyncHandler } from "../../shared/errors/async-handler";

import { authService } from "./auth.service";

class AuthController {
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
