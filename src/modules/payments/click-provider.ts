import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  WebhookVerificationResult,
} from "@/modules/payments/payment-provider";

/**
 * Click (click.uz) Shop API merchant integration.
 *
 * Click calls the merchant's webhook twice per successful payment —
 * `Prepare` (action=0) then `Complete` (action=1) — plus `Complete` with
 * error != 0 for a failed/cancelled payment. Every request is signed with
 * an MD5 `sign_string`, computed by concatenating specific fields (in a
 * fixed order that differs slightly between Prepare and Complete) with the
 * merchant's secret key, per Click's publicly documented Shop API:
 *
 *   Prepare:  md5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
 *   Complete: md5(click_trans_id + service_id + secret_key + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 *
 * The merchant recomputes this digest from the received fields and the
 * secret key it holds, and compares it (constant-time) against the
 * `sign_string` field Click sent — never trusting the fields themselves
 * without this check first.
 *
 * Initiating a payment redirects to Click's hosted checkout with the
 * merchant's service_id/merchant_id, the order id as `merchant_trans_id`,
 * and the amount in whole UZS (Click, unlike Payme, does not use a
 * subunit).
 */

const CLICK_CHECKOUT_BASE_URL = "https://my.click.uz/services/pay";

interface ClickWebhookFields {
  click_trans_id: string;
  service_id: string;
  merchant_trans_id: string;
  merchant_prepare_id?: string;
  amount: string;
  action: string; // "0" = Prepare, "1" = Complete
  sign_time: string;
  sign_string: string;
  error: string; // "0" on success
}

export class ClickPaymentProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const url = new URL(CLICK_CHECKOUT_BASE_URL);
    url.searchParams.set("service_id", env.CLICK_SERVICE_ID ?? "");
    url.searchParams.set("merchant_id", env.CLICK_MERCHANT_ID ?? "");
    url.searchParams.set("amount", String(input.amount));
    url.searchParams.set("transaction_param", input.orderId);
    url.searchParams.set("return_url", input.returnUrl);
    return { redirectUrl: url.toString() };
  }

  async verifyWebhookSignature(
    rawBody: string,
    _headers: Headers,
  ): Promise<WebhookVerificationResult> {
    let fields: Partial<ClickWebhookFields>;
    try {
      fields = parseClickBody(rawBody);
    } catch {
      return { valid: false, reason: "Invalid Click webhook body." };
    }

    const required: (keyof ClickWebhookFields)[] = [
      "click_trans_id",
      "service_id",
      "merchant_trans_id",
      "amount",
      "action",
      "sign_time",
      "sign_string",
      "error",
    ];
    for (const key of required) {
      if (!fields[key]) {
        return { valid: false, reason: `Missing required Click field: ${key}` };
      }
    }

    const isComplete = fields.action === "1";
    const parts = isComplete
      ? [
          fields.click_trans_id,
          fields.service_id,
          env.CLICK_SECRET_KEY ?? "",
          fields.merchant_trans_id,
          fields.merchant_prepare_id ?? "",
          fields.amount,
          fields.action,
          fields.sign_time,
        ]
      : [
          fields.click_trans_id,
          fields.service_id,
          env.CLICK_SECRET_KEY ?? "",
          fields.merchant_trans_id,
          fields.amount,
          fields.action,
          fields.sign_time,
        ];

    const expectedSign = createHash("md5").update(parts.join("")).digest("hex");
    const providedSign = fields.sign_string ?? "";

    if (!timingSafeEqualHex(expectedSign, providedSign)) {
      return { valid: false, reason: "Click sign_string verification failed." };
    }

    const amount = fields.amount ? Number(fields.amount) : undefined;
    const succeeded = fields.error === "0";

    return {
      valid: true,
      orderId: fields.merchant_trans_id,
      amount,
      providerTransactionId: fields.click_trans_id,
      event: succeeded
        ? isComplete
          ? "PAYMENT_SUCCEEDED"
          : undefined // Prepare stage: authenticated, but no order state change yet
        : "PAYMENT_FAILED",
    };
  }
}

/** Click sends webhooks as application/x-www-form-urlencoded. */
function parseClickBody(rawBody: string): Partial<ClickWebhookFields> {
  const params = new URLSearchParams(rawBody);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result as Partial<ClickWebhookFields>;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
