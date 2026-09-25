import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  WebhookVerificationResult,
} from "@/modules/payments/payment-provider";

/**
 * Payme (Paycom) merchant integration.
 *
 * Payme's Merchant API is JSON-RPC 2.0 over a single HTTPS endpoint that
 * Payme's servers call on your site (i.e. Payme is the client of your
 * webhook, not the other way around for verification purposes). Every
 * request carries an `Authorization: Basic <base64("Paycom:<merchant_key>")>`
 * header — the merchant's job is to verify that header matches its own
 * configured key before processing the RPC method (CheckPerformTransaction,
 * CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction,
 * GetStatement). This is fundamentally different from an HMAC-over-body
 * signature scheme (like Click's) — the "signature" here IS the shared
 * secret transmitted directly, so verification is a constant-time string
 * comparison against the decoded header rather than a computed digest.
 *
 * Initiating a payment is done by building Payme's standard checkout URL
 * with base64-encoded parameters (merchant id, order id as `m`/account
 * fields, amount in tiyin [1 UZS = 100 tiyin]) — Payme does not require a
 * server-side "create payment session" API call for the standard checkout
 * flow; the merchant simply redirects the customer to this URL.
 */

const PAYME_CHECKOUT_BASE_URL = "https://checkout.paycom.uz";

interface PaymeJsonRpcRequest {
  method: string;
  params: {
    account?: { order_id?: string };
    amount?: number; // tiyin (1 UZS = 100 tiyin)
    id?: string; // Payme's transaction id
  };
}

export class PaymePaymentProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const amountTiyin = input.amount * 100;
    const params = [
      `m=${env.PAYME_MERCHANT_ID}`,
      `ac.order_id=${input.orderId}`,
      `a=${amountTiyin}`,
      `c=${encodeURIComponent(input.returnUrl)}`,
    ].join(";");
    const encoded = Buffer.from(params, "utf-8").toString("base64");
    return { redirectUrl: `${PAYME_CHECKOUT_BASE_URL}/${encoded}` };
  }

  async verifyWebhookSignature(
    rawBody: string,
    headers: Headers,
  ): Promise<WebhookVerificationResult> {
    const authHeader = headers.get("authorization") ?? "";
    const expected = `Basic ${Buffer.from(`Paycom:${env.PAYME_SECRET_KEY}`, "utf-8").toString("base64")}`;

    // Constant-time comparison to avoid leaking information about the
    // secret's value through response-timing side channels.
    if (!timingSafeEqualStrings(authHeader, expected)) {
      return { valid: false, reason: "Invalid Payme Authorization header." };
    }

    let request: PaymeJsonRpcRequest;
    try {
      request = JSON.parse(rawBody) as PaymeJsonRpcRequest;
    } catch {
      return { valid: false, reason: "Invalid JSON-RPC body." };
    }

    const orderId = request.params?.account?.order_id;
    if (!orderId) {
      return { valid: false, reason: "Missing order_id in Payme request params." };
    }

    const amountUzs = request.params?.amount ? request.params.amount / 100 : undefined;

    switch (request.method) {
      case "PerformTransaction":
        return {
          valid: true,
          orderId,
          amount: amountUzs,
          providerTransactionId: request.params.id,
          event: "PAYMENT_SUCCEEDED",
        };
      case "CancelTransaction":
        return {
          valid: true,
          orderId,
          amount: amountUzs,
          providerTransactionId: request.params.id,
          event: "PAYMENT_CANCELLED",
        };
      case "CheckPerformTransaction":
      case "CreateTransaction":
      case "CheckTransaction":
      case "GetStatement":
        // These methods are part of the Payme RPC contract but do not, by
        // themselves, represent a completed/failed/cancelled payment — the
        // webhook route handler responds to them with the RPC-appropriate
        // acknowledgement without touching Order.status. Returning
        // valid: true with no `event` signals "authenticated, but no order
        // state change" to the caller.
        return { valid: true, orderId, amount: amountUzs };
      default:
        return { valid: false, reason: `Unrecognized Payme RPC method: ${request.method}` };
    }
  }
}

/**
 * Constant-time string comparison. Node's `crypto.timingSafeEqual` requires
 * equal-length buffers, so we pad to a fixed length first — this still
 * defeats simple timing attacks on the actual header contents without
 * throwing on a length mismatch (which would itself be an observable
 * timing signal if done via crypto.timingSafeEqual directly on the raw
 * unequal-length strings).
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  bufA.write(a);
  bufB.write(b);
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}
