import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/modules/auth/rbac";
import { changePasswordSchema } from "@/modules/auth/schemas";
import { hashPassword, verifyPassword } from "@/lib/password";
import { handleApiError, ApiError } from "@/lib/api-error";
import { revokeAllSessionsForUser, setSessionCookie, createSession } from "@/modules/auth/session";
import { getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/users/me/password — change password while authenticated.
 * Requires the current password (defense against a hijacked-but-unlocked
 * session being used to lock the real owner out permanently). Revokes all
 * other sessions and issues a fresh one for the current device.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const input = changePasswordSchema.parse(body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw ApiError.badRequest("Current password is incorrect.");
    }

    const newHash = await hashPassword(input.newPassword);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
    ]);

    await revokeAllSessionsForUser(user.id);
    const token = await createSession(user.id, {
      ipAddress: getClientIp(req.headers),
      userAgent: req.headers.get("user-agent"),
    });
    await setSessionCookie(token);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
