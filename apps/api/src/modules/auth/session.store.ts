import { redis } from "../../core/database/redis";
import { authRepository } from "./auth.repository";

export interface SessionStore {
  cacheSession(
    tokenId: string,
    userId: string,
    expiresAt: Date,
    ipAddress?: string | null,
    userAgent?: string | null,
    deviceFingerprint?: string | null
  ): Promise<void>;
  isSessionActive(tokenId: string): Promise<boolean>;
  invalidateSession(tokenId: string): Promise<void>;
  invalidateAllUserSessions(userId: string): Promise<void>;
  invalidateOtherSessions(userId: string, currentTokenId: string): Promise<void>;
}

// Write-through Session Cache
class PluggableSessionStore implements SessionStore {
  private getSessionKey(tokenId: string): string {
    return `session:${tokenId}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `user:sessions:${userId}`;
  }

  public async cacheSession(
    tokenId: string,
    userId: string,
    expiresAt: Date,
    ipAddress?: string | null,
    userAgent?: string | null,
    deviceFingerprint?: string | null
  ): Promise<void> {
    if (redis) {
      const key = this.getSessionKey(tokenId);
      const userKey = this.getUserSessionsKey(userId);
      const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

      const sessionData = {
        userId,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        deviceFingerprint: deviceFingerprint || null,
        expiresAt: expiresAt.toISOString(),
      };

      const pipeline = redis.pipeline();
      pipeline.set(key, JSON.stringify(sessionData), "EX", ttlSeconds);
      pipeline.sadd(userKey, tokenId);
      pipeline.expire(userKey, 7 * 24 * 60 * 60); // 7 days TTL for user set
      await pipeline.exec();
    }
  }

  public async isSessionActive(tokenId: string): Promise<boolean> {
    if (redis) {
      const key = this.getSessionKey(tokenId);
      const cached = await redis.get(key);
      if (cached) {
        return true;
      }
    }

    // Fallback to database check
    const tokenRecord = await authRepository.findRefreshTokenById(tokenId);
    if (!tokenRecord || tokenRecord.isRevoked || new Date() > new Date(tokenRecord.expiresAt)) {
      return false;
    }

    // If it was in Postgres but not Redis, re-cache it in Redis
    if (redis) {
      await this.cacheSession(
        tokenRecord.id,
        tokenRecord.userId,
        new Date(tokenRecord.expiresAt),
        tokenRecord.ipAddress,
        tokenRecord.userAgent,
        tokenRecord.deviceFingerprint
      );
    }

    return true;
  }

  public async invalidateSession(tokenId: string): Promise<void> {
    // 1. Revoke in Postgres
    await authRepository.revokeRefreshToken(tokenId);

    // 2. Remove from Redis
    if (redis) {
      const tokenRecord = await authRepository.findRefreshTokenById(tokenId);
      const key = this.getSessionKey(tokenId);
      
      const pipeline = redis.pipeline();
      pipeline.del(key);
      if (tokenRecord) {
        const userKey = this.getUserSessionsKey(tokenRecord.userId);
        pipeline.srem(userKey, tokenId);
      }
      await pipeline.exec();
    }
  }

  public async invalidateAllUserSessions(userId: string): Promise<void> {
    // 1. Revoke all in Postgres
    await authRepository.revokeAllUserRefreshTokens(userId);

    // 2. Remove all from Redis
    if (redis) {
      const userKey = this.getUserSessionsKey(userId);
      const tokenIds = await redis.smembers(userKey);

      if (tokenIds.length > 0) {
        const pipeline = redis.pipeline();
        for (const id of tokenIds) {
          pipeline.del(this.getSessionKey(id));
        }
        pipeline.del(userKey);
        await pipeline.exec();
      }
    }
  }

  public async invalidateOtherSessions(userId: string, currentTokenId: string): Promise<void> {
    // 1. Revoke in Postgres
    await authRepository.revokeOtherSessions(userId, currentTokenId);

    // 2. Revoke in Redis
    if (redis) {
      const userKey = this.getUserSessionsKey(userId);
      const tokenIds = await redis.smembers(userKey);

      if (tokenIds.length > 0) {
        const pipeline = redis.pipeline();
        for (const id of tokenIds) {
          if (id !== currentTokenId) {
            pipeline.del(this.getSessionKey(id));
            pipeline.srem(userKey, id);
          }
        }
        await pipeline.exec();
      }
    }
  }
}

export const sessionStore: SessionStore = new PluggableSessionStore();
