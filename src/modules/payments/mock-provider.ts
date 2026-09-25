import "server-only";
import { env } from "@/lib/env";
import type {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  WebhookVerificationResult,
} from "@/modules/payments/payment-provider";

/**
 * Development/test payment simulator. Never contacts any external network
 * and never moves real money. Isolated entirely from the Payme/Click
 * adapters — this class shares no code with them, so a bug in the mock can
 * never accidentally affect production-adapter behavior or vice versa.
 *
 * The "redirect URL" it returns points at this app's own
 * /pay/mock/:orderId page (a simple confirm/fail UI, built in a later UI
 * pass), which POSTs to /api/payments/mock/complete — a dev-only endpoint
 * that then calls verifyWebhookSignature below with a shape matching what
 * that endpoint constructs. This lets the entire ONLINE-payment order flow
 * be exercised end-to-end in development and CI without any real gateway.
 */
export class MockPaymentProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const url = new URL("/pay/mock", env.APP_URL);
    url.searchParams.set("orderId", input.orderId);
    url.searchParams.set("amount", String(input.amount));
    url.searchParams.set("returnUrl", input.returnUrl);
    return { redirectUrl: url.toString(), providerReference: `mock_${input.orderId}` };
  }

  async verifyWebhookSignature(rawBody: string): Promise<WebhookVerificationResult> {
    // The mock "webhook" is not signed (there is no external gateway to
    // sign anything) — it is trusted only because it originates from our
    // own dev-only completion endpoint, which itself requires an
    // authenticated session (see /api/payments/mock/complete). This
    // adapter must never be selected when NODE_ENV=production (enforced by
    // getPaymentProvider()).
    try {
      const body = JSON.parse(rawBody) as {
        orderId?: string;
        amount?: number;
        outcome?: "success" | "failure";
      };
      if (!body.orderId || typeof body.amount !== "number") {
        return { valid: false, reason: "Malformed mock webhook payload." };
      }
      return {
        valid: true,
        orderId: body.orderId,
        amount: body.amount,
        providerTransactionId: `mock_txn_${body.orderId}`,
        event: body.outcome === "failure" ? "PAYMENT_FAILED" : "PAYMENT_SUCCEEDED",
      };
    } catch {
      return { valid: false, reason: "Invalid JSON body." };
    }
  }
}
