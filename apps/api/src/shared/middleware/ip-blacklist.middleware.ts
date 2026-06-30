import { Request, Response, NextFunction } from "express";
import { redis } from "../../core/database/redis";
import { AppError } from "../errors/app-error";

// Local in-memory fallback IP blacklist
const localIpBlacklist = new Set<string>([
  "198.51.100.1", // Mock bad IP (Tor Exit Node)
  "203.0.113.5",  // Mock bad IP (Public Proxy)
]);

export async function ipBlacklistMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Support custom X-Simulated-IP header for testing impossible travel / blacklisting
  const rawIp = (req.headers["x-simulated-ip"] as string) || req.ip || req.socket.remoteAddress || "unknown";
  const ip = rawIp.trim();

  try {
    let isBlacklisted = false;

    if (redis) {
      isBlacklisted = await redis.sismember("blacklist:ips", ip) === 1;
    } else {
      isBlacklisted = localIpBlacklist.has(ip);
    }

    if (isBlacklisted) {
      return next(
        new AppError({
          message: "Access denied. Your IP address has been flagged by our security policy.",
          statusCode: 403,
          code: "AUTH_IP_BLACKLISTED",
        })
      );
    }

    next();
  } catch (err) {
    console.error("[IPBlacklist] Error checking blacklist:", err);
    next(); // Fail-open to preserve availability
  }
}

/**
 * Helper to dynamically add IPs to the blacklist
 */
export async function blacklistIp(ip: string): Promise<void> {
  const cleanIp = ip.trim();
  if (redis) {
    await redis.sadd("blacklist:ips", cleanIp);
  } else {
    localIpBlacklist.add(cleanIp);
  }
}
