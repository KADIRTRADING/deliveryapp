import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { getRestaurantPerformance } from "@/modules/analytics/admin-analytics.service";
import { dateRangeQuerySchema, resolveDateRange } from "@/modules/analytics/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/admin/analytics/restaurants — restaurant performance ranking by GMV. Admin only. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const query = dateRangeQuerySchema.parse({
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
    });

    const performance = await getRestaurantPerformance(resolveDateRange(query));
    return NextResponse.json({ restaurants: performance }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
