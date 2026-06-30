import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "./auth.middleware";
import { AppError } from "../../shared/errors/app-error";

const JWT_SECRET = process.env.JWT_SECRET || "super-secure-dev-jwt-secret-key-123456";

export function reauthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return next(
      new AppError({
        message: "Authentication required.",
        statusCode: 401,
        code: "AUTH_REQUIRED",
      })
    );
  }

  const reauthToken = req.headers["x-reauth-token"];

  if (!reauthToken || typeof reauthToken !== "string") {
    return next(
      new AppError({
        message: "Recent re-authentication is required to perform this sensitive action.",
        statusCode: 401,
        code: "REAUTH_REQUIRED",
      })
    );
  }

  try {
    const payload = jwt.verify(reauthToken, JWT_SECRET) as any;

    if (payload.type !== "reauth" || payload.userId !== req.user.userId) {
      return next(
        new AppError({
          message: "Invalid or expired re-authentication session. Please re-authenticate.",
          statusCode: 401,
          code: "REAUTH_REQUIRED",
        })
      );
    }

    next();
  } catch (error: any) {
    return next(
      new AppError({
        message: "Re-authentication session has expired. Please re-authenticate.",
        statusCode: 401,
        code: "REAUTH_REQUIRED",
      })
    );
  }
}
