import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import { getRestaurantSalesHistory } from "@/modules/analytics/restaurant-analytics.service";
import { dateRangeQuerySchema, resolveDateRange } from "@/modules/analytics/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/restaurants/:id/analytics/sales-history — daily sales/revenue time series. Owner/staff/admin only. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id);

    const query = dateRangeQuerySchema.parse({
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
    });

    const history = await getRestaurantSalesHistory(id, resolveDateRange(query));
    return NextResponse.json({ history }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
