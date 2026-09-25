import { describe, expect, it, beforeEach, vi } from "vitest";

vi.stubEnv("PAYME_MERCHANT_ID", "merchant-123");
vi.stubEnv("PAYME_SECRET_KEY", "test-payme-secret");

const { PaymePaymentProvider } = await import("@/modules/payments/payme-provider");

function basicAuthHeader(secret: string): Headers {
  const encoded = Buffer.from(`Paycom:${secret}`, "utf-8").toString("base64");
  return new Headers({ authorization: `Basic ${encoded}` });
}

describe("PaymePaymentProvider.verifyWebhookSignature", () => {
  let provider: InstanceType<typeof PaymePaymentProvider>;

  beforeEach(() => {
    provider = new PaymePaymentProvider();
  });

  it("accepts a PerformTransaction request with the correct Authorization header", async () => {
    const body = JSON.stringify({
      method: "PerformTransaction",
      params: { id: "txn-1", amount: 3500000, account: { order_id: "order-abc" } },
    });

    const result = await provider.verifyWebhookSignature(
      body,
      basicAuthHeader("test-payme-secret"),
    );

    expect(result.valid).toBe(true);
    expect(result.event).toEqual("PAYMENT_SUCCEEDED");
    expect(result.orderId).toEqual("order-abc");
    // amount is in tiyin (1 UZS = 100 tiyin) on the wire; the adapter converts to whole UZS.
    expect(result.amount).toEqual(35000);
  });

  it("rejects a request with an incorrect Authorization header", async () => {
    const body = JSON.stringify({
      method: "PerformTransaction",
      params: { id: "txn-1", amount: 3500000, account: { order_id: "order-abc" } },
    });

    const result = await provider.verifyWebhookSignature(body, basicAuthHeader("WRONG-SECRET"));
    expect(result.valid).toBe(false);
  });

  it("rejects a request with no Authorization header", async () => {
    const body = JSON.stringify({
      method: "PerformTransaction",
      params: { id: "txn-1", amount: 3500000, account: { order_id: "order-abc" } },
    });

    const result = await provider.verifyWebhookSignature(body, new Headers());
    expect(result.valid).toBe(false);
  });

  it("maps CancelTransaction to PAYMENT_CANCELLED", async () => {
    const body = JSON.stringify({
      method: "CancelTransaction",
      params: { id: "txn-1", amount: 3500000, account: { order_id: "order-abc" } },
    });

    const result = await provider.verifyWebhookSignature(
      body,
      basicAuthHeader("test-payme-secret"),
    );
    expect(result.valid).toBe(true);
    expect(result.event).toEqual("PAYMENT_CANCELLED");
  });

  it("authenticates CheckPerformTransaction without asserting an order-state-changing event", async () => {
    const body = JSON.stringify({
      method: "CheckPerformTransaction",
      params: { amount: 3500000, account: { order_id: "order-abc" } },
    });

    const result = await provider.verifyWebhookSignature(
      body,
      basicAuthHeader("test-payme-secret"),
    );
    expect(result.valid).toBe(true);
    expect(result.event).toBeUndefined();
  });

  it("rejects a request missing an order_id", async () => {
    const body = JSON.stringify({
      method: "PerformTransaction",
      params: { id: "txn-1", amount: 3500000, account: {} },
    });

    const result = await provider.verifyWebhookSignature(
      body,
      basicAuthHeader("test-payme-secret"),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects an unrecognized RPC method", async () => {
    const body = JSON.stringify({
      method: "SomeUnknownMethod",
      params: { account: { order_id: "order-abc" } },
    });

    const result = await provider.verifyWebhookSignature(
      body,
      basicAuthHeader("test-payme-secret"),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects a malformed JSON body", async () => {
    const result = await provider.verifyWebhookSignature(
      "not-json",
      basicAuthHeader("test-payme-secret"),
    );
    expect(result.valid).toBe(false);
  });
});

describe("PaymePaymentProvider.initiatePayment", () => {
  it("builds a base64-encoded Payme checkout URL", async () => {
    const provider = new PaymePaymentProvider();
    const result = await provider.initiatePayment({
      orderId: "order-abc",
      amount: 35000,
      returnUrl: "https://example.com/orders/order-abc",
    });

    expect(result.redirectUrl).toMatch(/^https:\/\/checkout\.paycom\.uz\//);
    const encoded = result.redirectUrl.split("/").pop()!;
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toContain("m=merchant-123");
    expect(decoded).toContain("ac.order_id=order-abc");
    expect(decoded).toContain("a=3500000"); // amount converted to tiyin
  });
});
