import Redis from "ioredis";

declare module "ioredis" {
  interface Redis {
    checkTokenBucket(key: string, capacity: number, refillRate: number, now: number, requested: number): Promise<[number, number]>;
  }
}

const redisUrl = process.env["REDIS_URL"];

let redis: Redis | null = null;

if (redisUrl) {
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by queues like BullMQ if used in the future
      connectTimeout: 5000,
    });

    // Define the custom Redis Lua command for Token Bucket rate limiter
    redis.defineCommand("checkTokenBucket", {
      numberOfKeys: 1,
      lua: `
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        local requested = tonumber(ARGV[4] or 1)

        local data = redis.call('HMGET', key, 'tokens', 'last_refreshed')
        local tokens = tonumber(data[1])
        local last_refreshed = tonumber(data[2])

        if not tokens then
          tokens = capacity
          last_refreshed = now
        else
          local elapsed = math.max(0, now - last_refreshed)
          local refilled = elapsed * refill_rate
          tokens = math.min(capacity, tokens + refilled)
          last_refreshed = now
        end

        local allowed = false
        if tokens >= requested then
          tokens = tokens - requested
          allowed = true
        end

        redis.call('HMSET', key, 'tokens', tokens, 'last_refreshed', last_refreshed)
        redis.call('EXPIRE', key, 3600)

        return {allowed and 1 or 0, math.floor(tokens)}
      `
    });

    redis.on("connect", () => {
      console.log("[Redis] Connected successfully.");
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err);
    });
  } catch (error) {
    console.error("[Redis] Failed to initialize client:", error);
    redis = null;
  }
} else {
  console.log("[Redis] REDIS_URL not configured. Falling back to local in-memory/Postgres stores.");
}

export { redis };
