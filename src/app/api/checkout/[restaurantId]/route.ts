import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { checkout } from "@/modules/orders/checkout.service";
import { checkoutSchema } from "@/modules/orders/schemas";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ restaurantId: string }>;
}

/**
 * POST /api/checkout/:restaurantId — create an order from the authenticated
 * user's cart for this restaurant. See checkout.service.ts for the full
 * list of server-side validations (delivery-zone membership, minimum
 * order, live re-pricing) — nothing here is trusted from the client beyond
 * the chosen addressId/paymentMethod/promoCode.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId } = await params;

    const ip = getClientIp(req.headers);
    const limit = await RateLimits.apiWritePerUser(session.user.id + ip);
    if (!limit.allowed) {
      throw ApiError.tooManyRequests("Too many requests. Try again shortly.");
    }

    const body = await req.json();
    const input = checkoutSchema.parse(body);

    const order = await checkout(session.user.id, restaurantId, input);

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
