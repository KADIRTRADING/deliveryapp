import { createHash, randomBytes, randomInt } from "node:crypto";

/** Cryptographically-random URL-safe opaque token (used for sessions, reset links). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex digest — used to store only a hash of secrets (session/reset tokens) at rest. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Cryptographically-random numeric OTP code, e.g. "483920" for a 6-digit code. */
export function generateNumericOtp(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(randomInt(min, max + 1));
}
