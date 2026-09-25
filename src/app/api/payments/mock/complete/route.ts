import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/modules/auth/rbac";
import { prisma } from "@/lib/prisma";
import { env, isProd } from "@/lib/env";
import { getPaymentProviderByKind } from "@/modules/payments/index";
import { handleVerifiedPaymentEvent } from "@/modules/payments/payments.service";
import { ApiError, handleApiError } from "@/lib/api-error";

const completeMockPaymentSchema = z.object({
  orderId: z.string().uuid(),
  outcome: z.enum(["success", "failure"]).default("success"),
});

/**
 * POST /api/payments/mock/complete — dev-only completion step for the
 * MockPaymentProvider's simulated checkout (see
 * src/modules/payments/mock-provider.ts, which documents this endpoint as
 * the counterpart to the redirect URL it hands back from
 * `initiatePayment`). This lets the ONLINE-payment order flow be exercised
 * end-to-end in development without any real payment gateway.
 *
 * This is intentionally NOT a substitute for a real provider webhook: it
 * requires an authenticated session (unlike a real gateway callback, which
 * authenticates via signature) and only ever constructs a MOCK-provider
 * event, which is refused outright unless PAYMENT_DEFAULT_PROVIDER=mock and
 * NODE_ENV!=production. It still goes through the exact same
 * verifyWebhookSignature -> handleVerifiedPaymentEvent path a real webhook
 * would (see /api/payments/webhooks/[provider]), so the order-state
 * transition logic under test here is identical to production, only the
 * trust boundary that triggers it differs.
 */
export async function POST(req: NextRequest) {
  try {
    if (isProd || env.PAYMENT_DEFAULT_PROVIDER !== "mock") {
      throw ApiError.notFound("Not found");
    }

    const session = await requireAuth();
    const body = await req.json();
    const input = completeMockPaymentSchema.parse(body);

    const order = await prisma.order.findFirst({
      where: { id: input.orderId, userId: session.user.id },
    });
    if (!order) {
      throw ApiError.notFound("Order not found");
    }
    if (order.paymentMethod !== "ONLINE") {
      throw ApiError.badRequest("This order was not placed with online payment.");
    }
    if (order.status !== "PAYMENT_PENDING") {
      throw ApiError.conflict(
        `This order is not awaiting payment (current status: ${order.status}).`,
      );
    }

    const rawBody = JSON.stringify({
      orderId: order.id,
      amount: order.totalAmount,
      outcome: input.outcome,
    });

    const provider = getPaymentProviderByKind("MOCK");
    const verification = await provider.verifyWebhookSignature(rawBody, new Headers());
    if (!verification.valid || !verification.orderId || !verification.event) {
      throw ApiError.badRequest(verification.reason ?? "Could not simulate payment completion.");
    }

    await handleVerifiedPaymentEvent({
      providerKind: "MOCK",
      orderId: verification.orderId,
      amount: verification.amount,
      providerTransactionId: verification.providerTransactionId,
      event: verification.event,
      rawPayload: JSON.parse(rawBody),
    });

    const updated = await prisma.order.findUnique({ where: { id: order.id } });

    return NextResponse.json({ success: true, status: updated?.status }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
