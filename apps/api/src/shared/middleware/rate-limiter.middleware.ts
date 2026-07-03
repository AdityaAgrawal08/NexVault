import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error";
import { redis } from "../../core/database/redis";
import { metricsService } from "../../core/monitoring/metrics.service";

interface RateLimitStore {
  checkLimit(ip: string, windowMs: number, maxRequests: number, policyKey: string): Promise<{
    allowed: boolean;
    currentCount: number;
    resetTime: number;
  }>;
}

// 1. In-Memory Token Bucket Rate Limiter
class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { tokens: number; lastRefreshed: number }>();

  constructor() {
    // Clean up idle buckets periodically to prevent memory leaks
    setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.buckets.entries()) {
        if (now - state.lastRefreshed > 10 * 60 * 1000) {
          this.buckets.delete(key);
        }
      }
    }, 10 * 60 * 1000).unref();
  }

  public async checkLimit(ip: string, windowMs: number, maxRequests: number, policyKey: string) {
    const key = `${ip}:${policyKey}`;
    const now = Date.now();
    const capacity = maxRequests;
    const refillRate = maxRequests / windowMs; // tokens per ms

    let state = this.buckets.get(key);
    if (!state) {
      state = { tokens: capacity, lastRefreshed: now };
      this.buckets.set(key, state);
    } else {
      const elapsed = Math.max(0, now - state.lastRefreshed);
      const refilled = elapsed * refillRate;
      state.tokens = Math.min(capacity, state.tokens + refilled);
      state.lastRefreshed = now;
    }

    let allowed = false;
    if (state.tokens >= 1) {
      state.tokens -= 1;
      allowed = true;
    }

    return {
      allowed,
      currentCount: Math.ceil(capacity - state.tokens),
      resetTime: now + Math.ceil((capacity - state.tokens) / refillRate),
    };
  }
}

// 2. Redis Token Bucket Rate Limiter (using atomic Lua command)
class RedisRateLimitStore implements RateLimitStore {
  public async checkLimit(ip: string, windowMs: number, maxRequests: number, policyKey: string) {
    if (!redis) {
      throw new Error("Redis client is not initialized.");
    }

    const key = `ratelimit:${ip}:${policyKey}`;
    const now = Date.now();
    const capacity = maxRequests;
    const refillRate = maxRequests / windowMs; // tokens per ms

    const [allowedVal, remainingTokens] = await redis.checkTokenBucket(key, capacity, refillRate, now, 1);
    const allowed = allowedVal === 1;

    return {
      allowed,
      currentCount: Math.ceil(capacity - remainingTokens),
      resetTime: now + Math.ceil((capacity - remainingTokens) / refillRate),
    };
  }
}

// Choose store based on Redis availability
const rateLimitStore: RateLimitStore = redis ? new RedisRateLimitStore() : new InMemoryRateLimitStore();

export interface RateLimitPolicy {
  capacity: number;
  refillRate: number;
  windowMs: number;
  maxRequests: number;
}

export const POLICIES: Record<string, RateLimitPolicy> = {
  global: {
    capacity: 10000,
    refillRate: 10000 / 60000,
    windowMs: 60000,
    maxRequests: 10000,
  },
  auth: {
    capacity: 10,
    refillRate: 10 / 120000,
    windowMs: 120000,
    maxRequests: 10,
  },
  otp: {
    capacity: 3,
    refillRate: 3 / 60000,
    windowMs: 60000,
    maxRequests: 3,
  },
  reset: {
    capacity: 5,
    refillRate: 5 / 60000,
    windowMs: 60000,
    maxRequests: 5,
  },
  api: {
    capacity: 100,
    refillRate: 100 / 60000,
    windowMs: 60000,
    maxRequests: 100,
  },
};

// Overload signatures for backward compatibility
export function rateLimiter(policyName: keyof typeof POLICIES): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export function rateLimiter(windowMs: number, maxRequests: number): (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function rateLimiter(param1: number | keyof typeof POLICIES, param2?: number) {
  let policy: RateLimitPolicy;
  let policyKey: string;

  if (typeof param1 === "string" && POLICIES[param1]) {
    policy = POLICIES[param1];
    policyKey = param1;
  } else {
    const windowMs = param1 as number;
    const maxRequests = param2 as number;
    policyKey = `custom:${windowMs}:${maxRequests}`;
    policy = {
      capacity: maxRequests,
      refillRate: maxRequests / windowMs,
      windowMs,
      maxRequests,
    };
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Determine target rate-limit key identifier
    let keyIdentifier = ip;
    if (policyKey === "auth" && req.body && (req.body.identifier || req.body.username || req.body.email)) {
      const ident = req.body.identifier || req.body.username || req.body.email;
      if (typeof ident === "string" && ident.trim()) {
        keyIdentifier = `user:${ident.trim().toLowerCase()}`;
      }
    }

    try {
      const result = await rateLimitStore.checkLimit(keyIdentifier, policy.windowMs, policy.maxRequests, policyKey);
      const retryAfterSeconds = Math.max(1, Math.ceil((result.resetTime - now) / 1000));

      res.setHeader("X-RateLimit-Limit", policy.maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, policy.maxRequests - result.currentCount));
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000));

      if (!result.allowed) {
        metricsService.incrementRateLimitTriggers();
        res.setHeader("Retry-After", retryAfterSeconds);
        const errMsg = policyKey === "auth"
          ? `Too many login attempts. Please wait for 2 minutes.`
          : `Too many requests. Please try again in ${retryAfterSeconds} seconds.`;
        return next(
          new AppError({
            message: errMsg,
            statusCode: 429,
            code: "TOO_MANY_REQUESTS",
          })
        );
      }

      next();
    } catch (err) {
      console.error("[RateLimiter] Error checking rate limit:", err);
      next(); // Fail-open
    }
  };
}
