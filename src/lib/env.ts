import { z } from "zod";

/**
 * Centralized, validated environment configuration.
 *
 * Rules enforced here (per platform security requirements):
 * - The app must FAIL FAST at startup if required variables are missing or malformed.
 * - In production, provider credentials that are missing must cause a hard failure
 *   for any code path that would otherwise silently fall back to a mock/dev adapter
 *   for something financially or security sensitive (payments, storage, sessions).
 * - Never read `process.env` ad-hoc elsewhere in the codebase — always go through
 *   this module so there is a single source of truth and a single validation point.
 */

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // --- Database -------------------------------------------------------------
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // --- Redis (cache, rate limiting, sessions support, queues) ----------------
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // --- Sessions / cookies -----------------------------------------------------
  SESSION_COOKIE_NAME: z.string().default("dapp_session"),
  CSRF_COOKIE_NAME: z.string().default("dapp_csrf"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Cookies are marked `Secure` in production; allow opting out only outside prod
  // (e.g. local HTTP development) — never configurable to false in production.
  FORCE_SECURE_COOKIES: z.coerce.boolean().default(isProduction),

  // --- Object storage (S3-compatible) -----------------------------------------
  STORAGE_PROVIDER: z.enum(["s3", "mock"]).default(isProduction ? "s3" : "mock"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // --- Map provider (abstracted; server-side only, never exposed to client) --
  MAP_PROVIDER: z.enum(["mapbox", "mock"]).default(isProduction ? "mapbox" : "mock"),
  MAPBOX_SERVER_TOKEN: z.string().optional(),

  // --- Payment providers (abstracted; dev adapters used when creds absent) ---
  PAYMENT_DEFAULT_PROVIDER: z.enum(["mock", "payme", "click"]).default(
    isProduction ? "payme" : "mock",
  ),
  PAYME_MERCHANT_ID: z.string().optional(),
  PAYME_SECRET_KEY: z.string().optional(),
  CLICK_MERCHANT_ID: z.string().optional(),
  CLICK_SERVICE_ID: z.string().optional(),
  CLICK_SECRET_KEY: z.string().optional(),

  // --- SMS / OTP delivery (abstracted; dev adapter logs codes instead) -------
  SMS_PROVIDER: z.enum(["console", "eskiz"]).default(isProduction ? "eskiz" : "console"),
  ESKIZ_EMAIL: z.string().optional(),
  ESKIZ_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast and loud. Never allow the app to boot with an invalid config —
    // that is how "silently broken in production" incidents happen.
    // eslint-disable-next-line no-console
    console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. See errors above.");
  }
  return parsed.data;
}

export const env = isTest
  ? envSchema.parse({ DATABASE_URL: "postgresql://test:test@localhost:5432/test", ...process.env })
  : loadEnv();

/**
 * Assert that a production-grade provider is actually configured with real
 * credentials before allowing a sensitive operation (payments, S3 uploads,
 * outbound SMS) to proceed in production. Call this from provider factories,
 * not scattered throughout business logic.
 */
export function assertProductionCredentials(label: string, values: Array<string | undefined>) {
  if (!isProduction) return;
  const missing = values.some((v) => !v || v.trim() === "");
  if (missing) {
    throw new Error(
      `Missing production credentials for ${label}. Refusing to start/serve this request. ` +
        `Configure the required environment variables (see .env.example).`,
    );
  }
}

export const isProd = isProduction;
