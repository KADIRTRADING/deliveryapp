import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listOrdersForAdmin } from "@/modules/admin/orders-admin.service";
import { listAdminOrdersQuerySchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/admin/orders — platform-wide order oversight, optionally filtered by status/restaurant. Admin only. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const params = req.nextUrl.searchParams;
    const query = listAdminOrdersQuerySchema.parse({
      status: params.get("status") ?? undefined,
      restaurantId: params.get("restaurantId") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });

    const result = await listOrdersForAdmin(query);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
