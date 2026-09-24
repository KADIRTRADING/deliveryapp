import { redis } from "@/lib/redis";

/**
 * Fixed-window rate limiter backed by Redis, using INCR + EXPIRE so it works
 * correctly across multiple app instances (a purely in-memory limiter would
 * not, and the platform must run behind a load balancer in production).
 *
 * Fails OPEN on Redis errors (logs and allows the request) rather than
 * fails CLOSED, because a Redis outage should degrade availability
 * gracefully rather than lock every user out of the platform. This is a
 * deliberate choice for abuse-prevention rate limits (login, OTP) — it does
 * NOT apply to financial correctness, which is never delegated to Redis.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const ttl = await redis.ttl(redisKey);
    const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

    return {
      allowed: count <= limit,
      remaining: Math.max(limit - count, 0),
      limit,
      resetAt,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[rate-limit] Redis error, failing open:", err);
    return { allowed: true, remaining: limit, limit, resetAt: Date.now() + windowSeconds * 1000 };
  }
}

/** Common named limiters — keep magic numbers centralized so they're auditable. */
export const RateLimits = {
  loginPerIp: (ip: string) => rateLimit(`login:ip:${ip}`, 10, 15 * 60),
  loginPerPhone: (phone: string) => rateLimit(`login:phone:${phone}`, 8, 15 * 60),
  otpRequestPerPhone: (phone: string) => rateLimit(`otp:req:${phone}`, 5, 10 * 60),
  otpVerifyPerPhone: (phone: string) => rateLimit(`otp:verify:${phone}`, 8, 10 * 60),
  registerPerIp: (ip: string) => rateLimit(`register:ip:${ip}`, 10, 60 * 60),
  passwordResetPerIp: (ip: string) => rateLimit(`pwreset:ip:${ip}`, 8, 60 * 60),
  apiWritePerUser: (userId: string) => rateLimit(`api:write:${userId}`, 120, 60),
  // Geocoding calls a paid external API in production (Mapbox); throttle
  // per-IP to bound cost exposure from a single abusive client.
  geocodePerIp: (ip: string) => rateLimit(`geocode:ip:${ip}`, 30, 60),
};

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return headers.get("x-real-ip") ?? "unknown";
}
