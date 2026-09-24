import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/modules/auth/rbac";
import { toPublicUser } from "@/modules/auth/dto";
import { handleApiError, ApiError } from "@/lib/api-error";

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
