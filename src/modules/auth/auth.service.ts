import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { ApiError } from "@/lib/api-error";
import { createSession } from "@/modules/auth/session";
import type { RegisterInput, LoginInput } from "@/modules/auth/schemas";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

export interface RequestMeta {
  ipAddress: string;
  userAgent: string | null;
}

/**
 * Register a new customer account. Every new account is granted the
 * CUSTOMER role by default — elevated roles (RESTAURANT_OWNER, ADMIN, etc.)
 * are only ever assigned by an admin/super-admin through the admin API,
 * never through self-service registration. This is enforced by simply never
 * accepting a `role` field from this endpoint's input schema.
 */
export async function registerUser(input: RegisterInput, meta: RequestMeta) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });
  if (existing) {
    throw ApiError.conflict("An account with this phone number already exists.");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      phone: input.phone,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      locale: input.locale,
      roles: {
        create: [{ role: "CUSTOMER" }],
      },
    },
    include: { roles: true },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "USER_REGISTERED",
    entityType: "User",
    entityId: user.id,
    ipAddress: meta.ipAddress,
  });

  const token = await createSession(user.id, meta);
  return { user, token };
}

export async function loginUser(input: LoginInput, meta: RequestMeta) {
  const user = await prisma.user.findUnique({
    where: { phone: input.phone },
    include: { roles: true },
  });

  // Deliberately generic error message + constant-shape work for both the
  // "no such user" and "wrong password" branches, to avoid leaking which
  // phone numbers are registered (user enumeration).
  const genericError = () => ApiError.unauthorized("Invalid phone number or password.");

  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    // Still perform a hash comparison against a dummy value so response
    // timing doesn't reveal whether the phone number exists.
    await verifyPassword(input.password, DUMMY_HASH);
    throw genericError();
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw genericError();
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: meta.ipAddress,
  });

  const token = await createSession(user.id, meta);
  return { user, token };
}

// A precomputed valid-format scrypt hash of a random value, used purely to
// equalize timing between "user not found" and "wrong password" branches.
const DUMMY_HASH = "scrypt$16384$8$1$00000000000000000000000000000000$" + "00".repeat(64);

export async function requestPasswordReset(phone: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { phone } });
  // Always behave the same way regardless of whether the user exists, to
  // avoid leaking account existence through response differences.
  if (!user || user.status !== "ACTIVE" || user.deletedAt) {
    return null;
  }

  const token = generateOpaqueToken(32);
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = sha256Hex(token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest("This reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    // Revoke every existing session — a password reset should force
    // re-authentication everywhere, including any device an attacker may
    // have been using.
    prisma.session.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
