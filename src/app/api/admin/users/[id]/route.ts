import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { getUserForAdmin } from "@/modules/admin/users.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/users/:id — fetch a single user's admin-facing profile. Admin only. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const user = await getUserForAdmin(id);
    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
