import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { createReview } from "@/modules/reviews/reviews.service";
import { createReviewSchema } from "@/modules/reviews/schemas";
import { handleApiError } from "@/lib/api-error";

/**
 * POST /api/reviews — review a delivered order. Only the customer who
 * placed the order may review it, only once it is DELIVERED, and only
 * once per order (enforced by a unique constraint on Review.orderId).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const input = createReviewSchema.parse(body);

    const review = await createReview(session.user.id, input);

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
