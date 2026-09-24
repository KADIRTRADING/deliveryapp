import Redis from "ioredis";
import { env } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __redis__: Redis | undefined;
}

/**
 * Singleton Redis client used for caching, rate limiting, and (in later
 * phases) queues and realtime pub/sub for live order status fan-out.
 *
 * Connection is lazy — it will not throw at import time if Redis is
 * temporarily unavailable; individual call sites decide whether a Redis
 * outage should fail-open (e.g. rate limiting) or fail-closed (nothing in
 * this codebase currently treats Redis as a hard dependency for financial
 * correctness — Postgres is the source of truth for all money-related data).
 */
export const redis =
  globalThis.__redis__ ??
  new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[redis] connection error:", err.message);
});

if (process.env.NODE_ENV !== "production") {
  globalThis.__redis__ = redis;
}
