import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/**
 * Password hashing using Node's built-in `scrypt` KDF.
 *
 * Why scrypt over bcrypt/argon2 here: it ships in Node's standard library
 * with no native compiled dependency, which means it behaves identically
 * across every environment (this sandbox, CI, Docker, production) without a
 * node-gyp build step that could silently fail on a given platform. Node's
 * documentation explicitly recommends `scrypt` for password storage.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>`
 * Encoding all KDF parameters alongside the hash allows them to be tuned
 * upward in the future without invalidating already-stored hashes.
 */

const SCRYPT_N = 16384; // cost factor (2^14) — Node's documented default
const SCRYPT_R = 8; // block size
const SCRYPT_P = 1; // parallelization
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scryptAsync(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derivedKey.toString(
    "hex",
  )}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltHex ?? "", "hex");
  const expected = Buffer.from(hashHex ?? "", "hex");
  if (salt.length === 0 || expected.length === 0) return false;

  const derivedKey = (await scryptAsync(plain.normalize("NFKC"), salt, expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;

  if (derivedKey.length !== expected.length) return false;
  return timingSafeEqual(derivedKey, expected);
}

/** Minimum password policy enforced server-side (also mirrored in Zod schema messages). */
export function isPasswordStrongEnough(plain: string): boolean {
  return plain.length >= 8 && plain.length <= 128;
}
