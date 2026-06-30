import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AppError } from "../errors/app-error";
import { redis } from "../../core/database/redis";
import { metricsService } from "../../core/monitoring/metrics.service";

interface RateLimitStore {
  checkLimit(ip: string, windowMs: number, maxRequests: number): Promise<{
    allowed: boolean;
    currentCount: number;
    resetTime: number;
  }>;
}

// 1. In-Memory Sliding Window Rate Limiter
class InMemoryRateLimitStore implements RateLimitStore {
  private ipRecords = new Map<string, { timestamps: number[] }>();

  constructor() {
    // Clean up old records periodically to prevent memory leaks
    setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of this.ipRecords.entries()) {
        const validTimestamps = record.timestamps.filter((t) => now - t < 10 * 60 * 1000);
        if (validTimestamps.length === 0) {
          this.ipRecords.delete(ip);
        } else {
          record.timestamps = validTimestamps;
        }
      }
    }, 10 * 60 * 1000).unref();
  }

  public async checkLimit(ip: string, windowMs: number, maxRequests: number) {
    const now = Date.now();
    let record = this.ipRecords.get(ip);
    if (!record) {
      record = { timestamps: [] };
      this.ipRecords.set(ip, record);
    }

    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

    if (record.timestamps.length >= maxRequests) {
      const oldestTimestamp = record.timestamps[0] || now;
      return {
        allowed: false,
        currentCount: record.timestamps.length,
        resetTime: oldestTimestamp + windowMs,
      };
    }

    record.timestamps.push(now);
    return {
      allowed: true,
      currentCount: record.timestamps.length,
      resetTime: now + windowMs,
    };
  }
}

// 2. Redis Sliding Window Rate Limiter (using atomic Transaction/Pipeline)
class RedisRateLimitStore implements RateLimitStore {
  public async checkLimit(ip: string, windowMs: number, maxRequests: number) {
    if (!redis) {
      throw new Error("Redis client is not initialized.");
    }

    const key = `ratelimit:${ip}`;
    const now = Date.now();
    const clearBefore = now - windowMs;

    // Use transaction to execute multiple commands atomically
    const results = await redis
      .multi()
      .zremrangebyscore(key, 0, clearBefore) // Remove expired requests
      .zcard(key)                            // Get count of requests in current window
      .exec();

    if (!results) {
      throw new Error("Redis transaction failed.");
    }

    // zremrangebyscore result is at index 0, zcard is at index 1
    const count = (results && results[1] && (results[1][1] as number)) || 0;

    if (count >= maxRequests) {
      // Get the oldest request in the set to calculate exact reset time
      const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
      const oldestScore = oldest[1] ? parseInt(oldest[1], 10) : now;
      
      return {
        allowed: false,
        currentCount: count,
        resetTime: oldestScore + windowMs,
      };
    }

    // Add current request to the set and set expiry on the key (windowMs in seconds)
    const pipeline = redis.pipeline();
    pipeline.zadd(key, now, `${now}-${crypto.randomUUID ? crypto.randomUUID() : Math.random()}`);
    pipeline.expire(key, Math.ceil(windowMs / 1000) + 5); // Add 5s buffer to TTL
    await pipeline.exec();

    return {
      allowed: true,
      currentCount: count + 1,
      resetTime: now + windowMs,
    };
  }
}

// Choose store based on Redis availability
const rateLimitStore: RateLimitStore = redis ? new RedisRateLimitStore() : new InMemoryRateLimitStore();

export function rateLimiter(windowMs: number, maxRequests: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    try {
      const result = await rateLimitStore.checkLimit(ip, windowMs, maxRequests);

      const retryAfterSeconds = Math.ceil((result.resetTime - now) / 1000);

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - result.currentCount));
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000));

      if (!result.allowed) {
        metricsService.incrementRateLimitTriggers();
        res.setHeader("Retry-After", retryAfterSeconds);
        return next(
          new AppError({
            message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
            statusCode: 429,
            code: "TOO_MANY_REQUESTS",
          })
        );
      }

      next();
    } catch (err) {
      // Fail-open: if Redis or rate limiting fails, log and let the request proceed to ensure availability
      console.error("[RateLimiter] Error checking rate limit:", err);
      next();
    }
  };
}
