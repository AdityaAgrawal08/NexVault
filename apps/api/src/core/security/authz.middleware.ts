import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.middleware";
import { AppError } from "../../shared/errors/app-error";

export function authorize(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        new AppError({
          message: "Authentication required.",
          statusCode: 401,
          code: "AUTH_REQUIRED",
        })
      );
    }

    const hasRole = allowedRoles.includes(req.user.role);
    if (!hasRole) {
      return next(
        new AppError({
          message: "You do not have permission to perform this action.",
          statusCode: 403,
          code: "AUTH_FORBIDDEN",
        })
      );
    }

    next();
  };
}
