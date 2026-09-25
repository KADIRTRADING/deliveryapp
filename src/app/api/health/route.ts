import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

/**
 * GET /api/health — liveness/readiness probe for container orchestration
 * (Docker healthchecks, load balancers, uptime monitors). Verifies the app
 * can actually reach its two hard infrastructure dependencies (Postgres,
 * Redis) rather than just returning 200 unconditionally, which would mask
 * a database outage behind a "healthy" status.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = { database: "ok", redis: "ok" };

  try {
    // Tagged-template $queryRaw (not $queryRawUnsafe) — Prisma parameterizes
    // this at the driver level even though there are no interpolated
    // values here, keeping this consistent with "no unparameterized raw
    // SQL anywhere in the codebase."
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.database = "error";
  }

  try {
    await redis.ping();
  } catch {
    checks.redis = "error";
  }

  const healthy = Object.values(checks).every((status) => status === "ok");

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  );
}
