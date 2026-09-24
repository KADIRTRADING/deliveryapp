import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import type { Role } from "@prisma/client";

/**
 * Server-side session store.
 *
 * Design: opaque random tokens, only a SHA-256 hash of which is ever
 * persisted to Postgres. The raw token lives only in an httpOnly, Secure,
 * SameSite=Lax cookie on the client. This is deliberately NOT a JWT:
 * - Sessions must be revocable instantly (logout, "log out all devices",
 *   admin-forced suspension) — a stateless JWT cannot be invalidated before
 *   its expiry without a server-side denylist, which is just a worse version
 *   of this table.
 * - No secret signing key to rotate/leak; compromising the DB requires an
 *   attacker to already have far broader access than just this table.
 */

export interface SessionUser {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
  locale: string;
  roles: Role[];
}

export interface AuthSession {
  sessionId: string;
  user: SessionUser;
}

const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<string> {
  const token = generateOpaqueToken(32);
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
      expiresAt,
    },
  });

  return token;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.FORCE_SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

export async function revokeSession(token: string): Promise<void> {
  const tokenHash = sha256Hex(token);
  await prisma.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Resolve the current request's session from the httpOnly cookie. Returns
 * null if there is no cookie, the session is expired/revoked, or the user
 * has been suspended/deleted since the session was issued (we re-check user
 * status on every request rather than trusting a cached claim).
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: { roles: true },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.deletedAt) return null;
  if (session.user.status !== "ACTIVE") return null;

  // Best-effort last-seen touch; failure here must never block the request.
  prisma.session
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      phone: session.user.phone,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      status: session.user.status,
      locale: session.user.locale,
      roles: session.user.roles.map((r) => r.role),
    },
  };
}

export async function getSessionCookieToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(env.SESSION_COOKIE_NAME)?.value ?? null;
}
