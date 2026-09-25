import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import {
  getRestaurantOverview,
  getTodayOverview,
} from "@/modules/analytics/restaurant-analytics.service";
import { dateRangeQuerySchema, resolveDateRange } from "@/modules/analytics/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/restaurants/:id/analytics/overview — orders/revenue/average
 * order value summary for this restaurant. Owner/staff/admin only. If no
 * date range is supplied, defaults to "today" per the spec's "today's
 * orders" requirement; supply from/to for a custom range.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id);

    const params_ = req.nextUrl.searchParams;
    const hasRange = params_.has("from") || params_.has("to");

    if (!hasRange) {
      const overview = await getTodayOverview(id);
      return NextResponse.json(overview, { status: 200 });
    }

    const query = dateRangeQuerySchema.parse({
      from: params_.get("from") ?? undefined,
      to: params_.get("to") ?? undefined,
    });
    const overview = await getRestaurantOverview(id, resolveDateRange(query));
    return NextResponse.json(overview, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
