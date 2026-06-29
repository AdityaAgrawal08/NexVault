import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "./jwt";
import { AppError } from "../../shared/errors/app-error";

// Extend Request type to include user payload
export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError({
      message: "Authorization token missing or malformed.",
      statusCode: 401,
      code: "AUTH_TOKEN_MISSING",
    }));
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error: any) {
    let message = "Invalid authorization token.";
    let code = "AUTH_TOKEN_INVALID";

    if (error.name === "TokenExpiredError") {
      message = "Authorization token has expired.";
      code = "AUTH_TOKEN_EXPIRED";
    }

    next(new AppError({
      message,
      statusCode: 401,
      code,
    }));
  }
}
