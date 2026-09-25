import { NextRequest, NextResponse } from "next/server";
import { getPaymentProviderByKind } from "@/modules/payments/index";
import { handleVerifiedPaymentEvent } from "@/modules/payments/payments.service";
import { writeAuditLog } from "@/modules/admin/audit-log.service";
import type { PaymentProviderKind, Prisma } from "@prisma/client";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

/**
 * POST /api/payments/webhooks/:provider — payment gateway callback
 * endpoint. Exempted from the CSRF double-submit check in src/middleware.ts
 * (an external gateway cannot participate in that cookie handshake);
 * authentication here is entirely the provider's own signature scheme,
 * verified via PaymentProvider.verifyWebhookSignature BEFORE any order
 * state is touched — this is the single most safety-critical control in
 * this route.
 *
 * Response shape differs per provider because each has its own webhook
 * protocol contract that must be honored exactly, or the provider will
 * treat the callback as failed and retry indefinitely:
 * - Payme: JSON-RPC 2.0 { result } or { error } envelope.
 * - Click: flat JSON echoing click_trans_id/merchant_trans_id plus an
 *   error/error_note pair (0 = success).
 * - Mock: a simple { success } acknowledgement (this app's own dev-only
 *   contract, not a real provider's).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  const providerKind = resolveProviderKind(provider);
  if (!providerKind) {
    return NextResponse.json({ error: "Unknown payment provider" }, { status: 404 });
  }

  const rawBody = await req.text();
  const paymentProvider = getPaymentProviderByKind(providerKind);

  let verification;
  try {
    verification = await paymentProvider.verifyWebhookSignature(rawBody, req.headers);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[payments] webhook verification threw for ${providerKind}:`, err);
    return errorResponse(providerKind, "Internal verification error");
  }

  if (!verification.valid) {
    await writeAuditLog({
      action: "PAYMENT_WEBHOOK_REJECTED",
      entityType: "Payment",
      metadata: { provider: providerKind, reason: verification.reason },
    });
    return errorResponse(providerKind, verification.reason ?? "Signature verification failed");
  }

  if (verification.event && verification.orderId) {
    try {
      await handleVerifiedPaymentEvent({
        providerKind,
        orderId: verification.orderId,
        amount: verification.amount,
        providerTransactionId: verification.providerTransactionId,
        event: verification.event,
        rawPayload: safeJsonParse(rawBody),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[payments] failed to apply verified ${providerKind} event:`, err);
      return errorResponse(providerKind, "Failed to apply payment event");
    }
  }

  return successResponse(providerKind, verification);
}

function resolveProviderKind(param: string): PaymentProviderKind | null {
  const normalized = param.toUpperCase();
  if (normalized === "PAYME" || normalized === "CLICK" || normalized === "MOCK") {
    return normalized as PaymentProviderKind;
  }
  return null;
}

function safeJsonParse(raw: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    // Click sends form-encoded bodies, not JSON — store as a plain object.
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function successResponse(
  providerKind: PaymentProviderKind,
  verification: { orderId?: string; providerTransactionId?: string },
) {
  if (providerKind === "PAYME") {
    return NextResponse.json(
      { result: { transaction: verification.providerTransactionId, state: 1 } },
      { status: 200 },
    );
  }
  if (providerKind === "CLICK") {
    return NextResponse.json(
      {
        click_trans_id: verification.providerTransactionId,
        merchant_trans_id: verification.orderId,
        error: 0,
        error_note: "Success",
      },
      { status: 200 },
    );
  }
  return NextResponse.json({ success: true }, { status: 200 });
}

function errorResponse(providerKind: PaymentProviderKind, message: string) {
  if (providerKind === "PAYME") {
    return NextResponse.json(
      { error: { code: -31008, message: { en: message, ru: message, uz: message } } },
      { status: 200 }, // Payme expects HTTP 200 even for RPC-level errors.
    );
  }
  if (providerKind === "CLICK") {
    return NextResponse.json({ error: -1, error_note: message }, { status: 200 });
  }
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}
