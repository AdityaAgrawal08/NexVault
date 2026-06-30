import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "./jwt";
import { AppError } from "../../shared/errors/app-error";
import { tokenBlocklistStore } from "./blocklist.store";

// Extend Request type to include user payload
export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
  token?: string; // Attach raw token for logout blocklisting
}

export async function authMiddleware(
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
    // 1. Verify token blocklist status (check signature for storage efficiency)
    const signature = token.split(".")[2];
    if (signature) {
      const isBlocked = await tokenBlocklistStore.isTokenBlocklisted(signature);
      if (isBlocked) {
        return next(new AppError({
          message: "Authorization token has been revoked.",
          statusCode: 401,
          code: "AUTH_TOKEN_REVOKED",
        }));
      }
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    req.token = token; // Attach raw token
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
