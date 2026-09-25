import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { env } from "@/lib/env";
import { getDefaultPaymentProvider, getPaymentProviderByKind } from "@/modules/payments/index";
import { advanceOrderStatusSystem } from "@/modules/orders/orders.service";
import type { PaymentProviderKind } from "@prisma/client";

/**
 * Start an ONLINE payment for an order that is currently PAYMENT_PENDING.
 * Creates a Payment record in INITIATED status and returns the redirect URL
 * the client should send the customer to. This never touches Order.status
 * — only a verified webhook does that (see handleWebhook below).
 */
export async function initiateOrderPayment(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
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

  const kindMap: Record<string, PaymentProviderKind> = {
    mock: "MOCK",
    payme: "PAYME",
    click: "CLICK",
  };
  const providerKind = kindMap[env.PAYMENT_DEFAULT_PROVIDER] ?? "MOCK";
  const provider = getDefaultPaymentProvider();

  const result = await provider.initiatePayment({
    orderId: order.id,
    amount: order.totalAmount,
    returnUrl: `${env.APP_URL}/orders/${order.id}`,
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: providerKind,
      status: "INITIATED",
      amount: order.totalAmount,
      providerTransactionId: result.providerReference ?? null,
    },
  });

  return result;
}

/**
 * Process a verified webhook event. The caller (the webhook route handler)
 * MUST have already called provider.verifyWebhookSignature and confirmed
 * `valid: true` before invoking this — this function trusts its inputs
 * completely, so it must never be reachable with unverified data.
 *
 * Idempotent by design: Payme/Click both retry webhook delivery, and this
 * function is safe to call more than once with the same
 * providerTransactionId — it upserts the Payment record and only advances
 * Order.status if it is still in a state where that transition is legal
 * (a second "success" webhook for an already-PAID order is a no-op, not an
 * error).
 */
export async function handleVerifiedPaymentEvent(input: {
  providerKind: PaymentProviderKind;
  orderId: string;
  amount?: number;
  providerTransactionId?: string;
  event?: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED" | "PAYMENT_CANCELLED";
  rawPayload: Prisma.InputJsonValue;
}): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) {
    throw ApiError.notFound("Order not found for this payment webhook.");
  }

  if (input.amount !== undefined && input.amount !== order.totalAmount) {
    // The amount asserted by the provider must match what we charged the
    // customer at checkout — a mismatch here could indicate a tampered or
    // misrouted webhook and must never silently mark the order paid.
    throw ApiError.conflict(
      `Webhook amount (${input.amount}) does not match order total (${order.totalAmount}).`,
    );
  }

  const paymentStatus =
    input.event === "PAYMENT_SUCCEEDED"
      ? "SUCCEEDED"
      : input.event === "PAYMENT_FAILED"
        ? "FAILED"
        : input.event === "PAYMENT_CANCELLED"
          ? "CANCELLED"
          : "PENDING";

  // Payment has no compound-unique key on (orderId, provider) in the
  // schema, so we find the most recent payment attempt for this order+
  // provider explicitly rather than relying on Prisma's upsert (which
  // requires a unique/compound-unique `where`).
  const existingPaymentId = await findPendingPaymentId(input.orderId, input.providerKind);
  if (existingPaymentId) {
    await prisma.payment.update({
      where: { id: existingPaymentId },
      data: {
        status: paymentStatus,
        providerTransactionId: input.providerTransactionId,
        rawPayload: input.rawPayload,
      },
    });
  } else {
    await prisma.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.providerKind,
        status: paymentStatus,
        amount: input.amount ?? order.totalAmount,
        providerTransactionId: input.providerTransactionId,
        rawPayload: input.rawPayload,
      },
    });
  }

  if (input.event === "PAYMENT_SUCCEEDED" && order.status === "PAYMENT_PENDING") {
    await advanceOrderStatusSystem(order.id, "PAID", {
      reason: "Payment confirmed by provider webhook",
    });
  } else if (
    (input.event === "PAYMENT_FAILED" || input.event === "PAYMENT_CANCELLED") &&
    order.status === "PAYMENT_PENDING"
  ) {
    await advanceOrderStatusSystem(order.id, "CANCELLED", {
      reason: `Payment ${input.event === "PAYMENT_FAILED" ? "failed" : "cancelled"} at provider`,
    });
  }
}

async function findPendingPaymentId(
  orderId: string,
  providerKind: PaymentProviderKind,
): Promise<string | null> {
  const payment = await prisma.payment.findFirst({
    where: { orderId, provider: providerKind },
    orderBy: { createdAt: "desc" },
  });
  return payment?.id ?? null;
}

export { getPaymentProviderByKind };
