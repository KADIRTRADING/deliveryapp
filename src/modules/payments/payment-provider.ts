import "server-only";

/**
 * PaymentProvider abstraction.
 *
 * Per "Create a PaymentProvider interface so Uzbekistan payment gateways
 * can be integrated later" and "Verify payment callbacks/webhooks
 * server-side. Never mark an order paid only from a frontend response":
 * this interface separates two concerns that must never be conflated:
 *
 * 1. `initiatePayment` — called when a customer chooses ONLINE payment at
 *    checkout. Returns whatever the client needs to hand off to the
 *    payment provider's own checkout UI (a redirect URL, or provider-
 *    specific parameters for an embedded widget). This never marks an
 *    order as paid — it only starts the payment flow.
 * 2. `verifyWebhookSignature` — called by the webhook route handler
 *    (src/app/api/payments/webhooks/[provider]/route.ts) BEFORE trusting
 *    anything in the webhook body. Only after this returns true may the
 *    order's PAYMENT_PENDING -> PAID transition be applied. This is the
 *    single most important security boundary in the payments module: a
 *    forged webhook POST must never be able to mark an order paid.
 *
 * Concrete adapters:
 * - MockPaymentProvider: a fully functional in-process simulator used in
 *   development/CI. It never charges real money and never talks to any
 *   external network — its "webhook" is simulated by a companion
 *   dev-only endpoint (see /api/payments/mock/complete) rather than an
 *   actual provider callback.
 * - PaymePaymentProvider / ClickPaymentProvider: real signature-
 *   verification logic implemented against each provider's publicly
 *   documented Merchant API contract. They REQUIRE real merchant
 *   credentials to be useful in production (enforced by
 *   assertProductionCredentials in getPaymentProvider below) — this
 *   codebase implements the verification/parsing logic completely, but
 *   cannot itself obtain real Payme/Click merchant credentials, per the
 *   platform requirement to "implement complete provider interface,
 *   environment-variable configuration, development adapter isolated from
 *   production, and clear setup instructions" when credentials are
 *   unavailable at build time.
 */

export interface InitiatePaymentInput {
  orderId: string;
  /** Whole UZS. */
  amount: number;
  returnUrl: string;
}

export interface InitiatePaymentResult {
  /** URL the client should redirect the customer to in order to pay. */
  redirectUrl: string;
  /** Provider-assigned identifier for this payment attempt, if any. */
  providerReference?: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  /** Present only when valid — the order this webhook pertains to. */
  orderId?: string;
  /** Present only when valid — the provider's transaction id, for idempotency/audit. */
  providerTransactionId?: string;
  /** Present only when valid — amount asserted by the provider, in whole UZS. */
  amount?: number;
  /** The event this webhook represents. */
  event?: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED" | "PAYMENT_CANCELLED";
  /** Human-readable rejection reason, present only when valid === false. */
  reason?: string;
}

export interface PaymentProvider {
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;

  /**
   * Verify a raw webhook request server-side. `rawBody` MUST be the exact
   * unparsed request body (many signature schemes, including Click's, sign
   * over specific fields in a specific order — verifying against a
   * re-serialized/re-ordered JSON object can silently accept a tampered
   * payload). `headers` carries any signature-bearing headers the provider
   * uses (e.g. Payme's Authorization header).
   */
  verifyWebhookSignature(rawBody: string, headers: Headers): Promise<WebhookVerificationResult>;
}
