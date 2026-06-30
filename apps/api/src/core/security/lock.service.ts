import { redis } from "../database/redis";
import crypto from "crypto";

export interface LockService {
  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<boolean>;
}

// 1. In-Memory Lock Store (Fallback)
class InMemoryLockService implements LockService {
  private locks = new Map<string, { token: string; expiresAt: number }>();

  public async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const now = Date.now();
    const current = this.locks.get(key);

    if (current && now < current.expiresAt) {
      return null; // Lock is currently held
    }

    const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString();
    this.locks.set(key, { token, expiresAt: now + ttlMs });
    return token;
  }

  public async releaseLock(key: string, token: string): Promise<boolean> {
    const current = this.locks.get(key);
    if (!current) return false;

    if (current.token === token) {
      this.locks.delete(key);
      return true;
    }

    return false;
  }
}

// 2. Redis Lock Store (Redlock-inspired single-instance lock)
class RedisLockService implements LockService {
  public async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    if (!redis) throw new Error("Redis is not initialized.");

    const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString();
    
    // Set lock key with lease time (ttlMs) only if it doesn't exist (NX)
    const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
    if (acquired === "OK") {
      return token;
    }

    return null;
  }

  public async releaseLock(key: string, token: string): Promise<boolean> {
    if (!redis) throw new Error("Redis is not initialized.");

    // Atomic release using Lua script to ensure we only delete the lock we own
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, 1, key, token);
    return result === 1;
  }
}

export const lockService: LockService = redis ? new RedisLockService() : new InMemoryLockService();
