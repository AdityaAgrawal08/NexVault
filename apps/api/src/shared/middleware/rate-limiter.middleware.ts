import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";

interface RateLimitRecord {
  timestamps: number[];
}

const ipRecords = new Map<string, RateLimitRecord>();

// Clean up old records periodically to prevent memory leaks (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRecords.entries()) {
    const validTimestamps = record.timestamps.filter((t) => now - t < 10 * 60 * 1000);
    if (validTimestamps.length === 0) {
      ipRecords.delete(ip);
    } else {
      record.timestamps = validTimestamps;
    }
  }
}, 10 * 60 * 1000).unref();

export function rateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let record = ipRecords.get(ip);
    if (!record) {
      record = { timestamps: [] };
      ipRecords.set(ip, record);
    }

    // Filter out timestamps older than the window
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    if (record.timestamps.length >= maxRequests) {
      const oldestTimestamp = record.timestamps[0] || now;
      const resetTime = oldestTimestamp + windowMs;
      const retryAfterSeconds = Math.ceil((resetTime - now) / 1000);

      res.setHeader("Retry-After", retryAfterSeconds);
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", 0);
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000));

      return next(
        new AppError({
          message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
          statusCode: 429,
          code: "TOO_MANY_REQUESTS",
        })
      );
    }

    record.timestamps.push(now);

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", maxRequests - record.timestamps.length);
    res.setHeader("X-RateLimit-Reset", Math.ceil((now + windowMs) / 1000));

    next();
  };
}
