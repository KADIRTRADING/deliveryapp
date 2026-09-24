import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/modules/auth/rbac";
import { updateProfileSchema } from "@/modules/auth/schemas";
import { toPublicUser } from "@/modules/auth/dto";
import { handleApiError, ApiError } from "@/lib/api-error";

/** GET /api/users/me — fetch the authenticated user's own profile. */
export async function GET() {
  try {
    const session = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { roles: true },
    });
    if (!user) throw ApiError.notFound("User not found");
    return NextResponse.json({ user: toPublicUser(user) }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/users/me — edit the authenticated user's own profile fields. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const input = updateProfileSchema.parse(body);

    if (input.email) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing && existing.id !== session.user.id) {
        throw ApiError.conflict("This email is already in use.");
      }
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        locale: input.locale,
        avatarUrl: input.avatarUrl,
        // Changing email requires re-verification; clear any prior verification.
        ...(input.email !== undefined ? { email: input.email, emailVerifiedAt: null } : {}),
      },
      include: { roles: true },
    });

    return NextResponse.json({ user: toPublicUser(user) }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
