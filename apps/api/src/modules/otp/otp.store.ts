import { otpRepository, OTPRecord } from "./otp.repository";
import { redis } from "../../core/database/redis";

export interface OTPStore {
  saveOTP(email: string, purpose: string, otpHash: string, expiresAt: Date): Promise<void>;
  findLatestOTP(email: string, purpose: string): Promise<{ id: string; otpHash: string; attempts: number; expiresAt: Date; createdAt: Date } | null>;
  incrementAttempts(id: string, email?: string, purpose?: string): Promise<number>;
  deleteOTP(id: string, email?: string, purpose?: string): Promise<void>;
}

// 1. Postgres OTP Store (Transactional, SQL-backed)
class PostgresOTPStore implements OTPStore {
  public async saveOTP(email: string, purpose: string, otpHash: string, expiresAt: Date): Promise<void> {
    await otpRepository.createOTP(email, purpose, otpHash, expiresAt);
  }

  public async findLatestOTP(email: string, purpose: string) {
    return otpRepository.findLatestOTP(email, purpose);
  }

  public async incrementAttempts(id: string): Promise<number> {
    return otpRepository.incrementAttempts(id);
  }

  public async deleteOTP(id: string): Promise<void> {
    await otpRepository.deleteOTP(id);
  }
}

// 2. Redis OTP Store (High-throughput, Automatic TTL)
class RedisOTPStore implements OTPStore {
  private getKey(email: string, purpose: string): string {
    return `otp:${email}:${purpose}`;
  }

  public async saveOTP(email: string, purpose: string, otpHash: string, expiresAt: Date): Promise<void> {
    const key = this.getKey(email, purpose);
    const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    
    const data = {
      id: `${email}:${purpose}:${Date.now()}`,
      otpHash,
      attempts: 0,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    };

    if (!redis) throw new Error("Redis is not initialized.");
    await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  }

  public async findLatestOTP(email: string, purpose: string) {
    if (!redis) throw new Error("Redis is not initialized.");
    
    const key = this.getKey(email, purpose);
    const dataStr = await redis.get(key);
    if (!dataStr) return null;

    const data = JSON.parse(dataStr);
    return {
      id: data.id,
      email,
      otpHash: data.otpHash,
      purpose,
      attempts: data.attempts,
      expiresAt: new Date(data.expiresAt),
      createdAt: new Date(data.createdAt),
    };
  }

  public async incrementAttempts(id: string, email?: string, purpose?: string): Promise<number> {
    const parts = id.split(":");
    const finalEmail = email || parts[0] || "";
    const finalPurpose = purpose || parts[1] || "";
    
    if (!redis) throw new Error("Redis is not initialized.");

    const key = this.getKey(finalEmail, finalPurpose);
    const dataStr = await redis.get(key);
    if (!dataStr) return 0;

    const data = JSON.parse(dataStr);
    data.attempts += 1;

    // Save back with remaining TTL
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      await redis.set(key, JSON.stringify(data), "EX", ttl);
    } else {
      await redis.set(key, JSON.stringify(data));
    }

    return data.attempts;
  }

  public async deleteOTP(id: string, email?: string, purpose?: string): Promise<void> {
    const parts = id.split(":");
    const finalEmail = email || parts[0] || "";
    const finalPurpose = purpose || parts[1] || "";

    if (!redis) throw new Error("Redis is not initialized.");
    
    const key = this.getKey(finalEmail, finalPurpose);
    await redis.del(key);
  }
}

export const otpStore: OTPStore = redis ? new RedisOTPStore() : new PostgresOTPStore();
export type { PostgresOTPStore, RedisOTPStore };
