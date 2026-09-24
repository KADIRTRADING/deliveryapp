import { PrismaClient } from "@prisma/client";
import { isProd } from "@/lib/env";

/**
 * Singleton PrismaClient. In dev, Next.js hot-reloads modules, which would
 * otherwise create a new PrismaClient (and a new connection pool) on every
 * edit. We cache the instance on `globalThis` to avoid exhausting Postgres
 * connections during local development.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma__ ??
  new PrismaClient({
    log: isProd ? ["error", "warn"] : ["warn", "error"],
  });

if (!isProd) {
  globalThis.__prisma__ = prisma;
}
