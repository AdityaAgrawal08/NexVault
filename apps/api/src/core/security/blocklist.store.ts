import { redis } from "../database/redis";

export interface TokenBlocklistStore {
  blocklistToken(tokenSignature: string, ttlSeconds: number): Promise<void>;
  isTokenBlocklisted(tokenSignature: string): Promise<boolean>;
}

// 1. In-Memory Blocklist (Fallback)
class InMemoryTokenBlocklistStore implements TokenBlocklistStore {
  private blocklist = new Map<string, number>(); // signature -> expiry timestamp

  constructor() {
    // Clean up expired entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const [sig, expiry] of this.blocklist.entries()) {
        if (now > expiry) {
          this.blocklist.delete(sig);
        }
      }
    }, 60 * 1000).unref();
  }

  public async blocklistToken(tokenSignature: string, ttlSeconds: number): Promise<void> {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.blocklist.set(tokenSignature, expiry);
  }

  public async isTokenBlocklisted(tokenSignature: string): Promise<boolean> {
    const expiry = this.blocklist.get(tokenSignature);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.blocklist.delete(tokenSignature);
      return false;
    }
    return true;
  }
}

// 2. Redis-backed Blocklist (Production)
class RedisTokenBlocklistStore implements TokenBlocklistStore {
  private getKey(signature: string): string {
    return `blocklist:${signature}`;
  }

  public async blocklistToken(tokenSignature: string, ttlSeconds: number): Promise<void> {
    if (!redis) throw new Error("Redis is not initialized.");
    const key = this.getKey(tokenSignature);
    await redis.set(key, "1", "EX", Math.max(1, ttlSeconds));
  }

  public async isTokenBlocklisted(tokenSignature: string): Promise<boolean> {
    if (!redis) return false; // Fallback-safe
    const key = this.getKey(tokenSignature);
    const exists = await redis.get(key);
    return exists === "1";
  }
}

export const tokenBlocklistStore: TokenBlocklistStore = redis
  ? new RedisTokenBlocklistStore()
  : new InMemoryTokenBlocklistStore();
