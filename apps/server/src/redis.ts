import { createClient } from "redis";
import { pino } from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

redisClient.on("error", (err: Error) => {
  logger.error({ err }, "Redis client error");
});

redisClient.on("connect", () => {
  logger.info("✅ Redis connected");
});

export async function connectRedis() {
  try {
    await redisClient.connect();
  } catch (error) {
    logger.warn({ error }, "⚠️  Redis unavailable — running without cache/pub-sub");
  }
}

/** Store a value with optional TTL in seconds */
export async function cacheSet(key: string, value: unknown, ttlSeconds?: number) {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.setEx(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
  } catch {
    // Non-fatal — degrade gracefully
  }
}

/** Retrieve a cached value */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redisClient.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Delete a cached key */
export async function cacheDel(key: string) {
  try {
    await redisClient.del(key);
  } catch {
    // Non-fatal
  }
}

/** Increment a counter (for rate limiting) */
export async function cacheIncr(key: string, ttlSeconds: number): Promise<number> {
  try {
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, ttlSeconds);
    }
    return count;
  } catch {
    return 0;
  }
}
