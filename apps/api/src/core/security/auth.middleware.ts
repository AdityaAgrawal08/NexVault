import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "./jwt";
import { AppError } from "../../shared/errors/app-error";
import { tokenBlocklistStore } from "./blocklist.store";
import { geoVelocityService } from "./geo.service";
import { sessionStore } from "../../modules/auth/session.store";
import { auditService } from "../../modules/audit/audit.service";

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

    // 2. Validate session is still active in sessionStore
    const isSessionActive = await sessionStore.isSessionActive(payload.tokenId);
    if (!isSessionActive) {
      return next(new AppError({
        message: "Your session has been revoked or is no longer active. Please log in again.",
        statusCode: 401,
        code: "AUTH_SESSION_REVOKED",
      }));
    }
    
    // 3. Impossible Travel / Geo-Velocity Check
    const ip = (req.headers["x-simulated-ip"] as string) || req.ip || req.socket.remoteAddress || "unknown";
    const travelResult = await geoVelocityService.checkTravel(payload.userId, payload.tokenId, ip);
    
    if (!travelResult.allowed) {
      // Revoke the session immediately
      await sessionStore.invalidateSession(payload.tokenId);

      // Log critical security event
      await auditService.log({
        userId: payload.userId,
        action: "IMPOSSIBLE_TRAVEL_DETECTED",
        ipAddress: ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          tokenId: payload.tokenId,
          speedKmh: travelResult.speed,
          distanceKm: travelResult.distance,
        },
      });

      return next(new AppError({
        message: "Suspicious travel activity detected. Session revoked for security. Please log in again.",
        statusCode: 401,
        code: "AUTH_IMPOSSIBLE_TRAVEL",
      }));
    }

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
