import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { getReviewEligibility } from "@/modules/reviews/reviews.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/restaurants/:id/review-eligibility — the authenticated
 * customer's delivered-but-not-yet-reviewed orders for this restaurant,
 * used to drive a "you can review this order" prompt in the UI.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const result = await getReviewEligibility(session.user.id, id);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
