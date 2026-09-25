import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { getOrderForAdmin } from "@/modules/admin/orders-admin.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/orders/:id — fetch any order on the platform, including payment records. Admin only. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const order = await getOrderForAdmin(id);
    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
