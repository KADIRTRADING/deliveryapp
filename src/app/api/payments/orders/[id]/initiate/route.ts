import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { initiateOrderPayment } from "@/modules/payments/payments.service";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/payments/orders/:id/initiate — start an online payment for an
 * order placed with paymentMethod=ONLINE. Returns a redirect URL; the
 * order is NOT marked paid by this call — only a verified webhook can do
 * that (see /api/payments/webhooks/[provider]).
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();

    const limit = await RateLimits.paymentInitiatePerUser(session.user.id);
    if (!limit.allowed) {
      throw ApiError.tooManyRequests("Too many payment attempts. Try again shortly.");
    }

    const { id } = await params;
    const result = await initiateOrderPayment(session.user.id, id);
    return NextResponse.json({ payment: result }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
