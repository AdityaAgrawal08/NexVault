import Redis from "ioredis";

const redisUrl = process.env["REDIS_URL"];

let redis: Redis | null = null;

if (redisUrl) {
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by queues like BullMQ if used in the future
      connectTimeout: 5000,
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
