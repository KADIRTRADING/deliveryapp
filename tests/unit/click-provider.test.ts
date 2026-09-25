import { describe, expect, it, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";

// The Click adapter reads CLICK_SECRET_KEY from src/lib/env at call time,
// so we set it before importing the module under test.
vi.stubEnv("CLICK_SECRET_KEY", "test-secret-key");
vi.stubEnv("CLICK_MERCHANT_ID", "12345");
vi.stubEnv("CLICK_SERVICE_ID", "6789");

const { ClickPaymentProvider } = await import("@/modules/payments/click-provider");

function buildSignedBody(
  fields: Record<string, string>,
  isComplete: boolean,
  secret: string,
): string {
  const parts = isComplete
    ? [
        fields.click_trans_id,
        fields.service_id,
        secret,
        fields.merchant_trans_id,
        fields.merchant_prepare_id ?? "",
        fields.amount,
        fields.action,
        fields.sign_time,
      ]
    : [
        fields.click_trans_id,
        fields.service_id,
        secret,
        fields.merchant_trans_id,
        fields.amount,
        fields.action,
        fields.sign_time,
      ];
  const signString = createHash("md5").update(parts.join("")).digest("hex");
  return new URLSearchParams({ ...fields, sign_string: signString }).toString();
}

describe("ClickPaymentProvider.verifyWebhookSignature", () => {
  let provider: InstanceType<typeof ClickPaymentProvider>;

  beforeEach(() => {
    provider = new ClickPaymentProvider();
  });

  it("accepts a correctly signed Prepare (action=0) request", async () => {
    const fields = {
      click_trans_id: "111",
      service_id: "6789",
      merchant_trans_id: "order-abc",
      amount: "50000",
      action: "0",
      sign_time: "2024-01-01 00:00:00",
      error: "0",
    };
    const body = buildSignedBody(fields, false, "test-secret-key");

    const result = await provider.verifyWebhookSignature(body, new Headers());
    expect(result.valid).toBe(true);
    expect(result.orderId).toEqual("order-abc");
  });

  it("accepts a correctly signed Complete (action=1) request as PAYMENT_SUCCEEDED", async () => {
    const fields = {
      click_trans_id: "111",
      service_id: "6789",
      merchant_trans_id: "order-abc",
      merchant_prepare_id: "999",
      amount: "50000",
      action: "1",
      sign_time: "2024-01-01 00:00:00",
      error: "0",
    };
    const body = buildSignedBody(fields, true, "test-secret-key");

    const result = await provider.verifyWebhookSignature(body, new Headers());
    expect(result.valid).toBe(true);
    expect(result.event).toEqual("PAYMENT_SUCCEEDED");
    expect(result.amount).toEqual(50000);
  });

  it("rejects a request with an incorrect sign_string", async () => {
    const body = new URLSearchParams({
      click_trans_id: "111",
      service_id: "6789",
      merchant_trans_id: "order-abc",
      amount: "50000",
      action: "0",
      sign_time: "2024-01-01 00:00:00",
      error: "0",
      sign_string: "0000000000000000000000000000000",
    }).toString();

    const result = await provider.verifyWebhookSignature(body, new Headers());
    expect(result.valid).toBe(false);
  });

  it("rejects a request signed with the wrong secret key", async () => {
    const fields = {
      click_trans_id: "111",
      service_id: "6789",
      merchant_trans_id: "order-abc",
      amount: "50000",
      action: "0",
      sign_time: "2024-01-01 00:00:00",
      error: "0",
    };
    const body = buildSignedBody(fields, false, "WRONG-SECRET");

    const result = await provider.verifyWebhookSignature(body, new Headers());
    expect(result.valid).toBe(false);
  });

  it("reports PAYMENT_FAILED when a Complete request has a nonzero error code", async () => {
    const fields = {
      click_trans_id: "111",
      service_id: "6789",
      merchant_trans_id: "order-abc",
      merchant_prepare_id: "999",
      amount: "50000",
      action: "1",
      sign_time: "2024-01-01 00:00:00",
      error: "-1",
    };
    const body = buildSignedBody(fields, true, "test-secret-key");

    const result = await provider.verifyWebhookSignature(body, new Headers());
    expect(result.valid).toBe(true);
    expect(result.event).toEqual("PAYMENT_FAILED");
  });

  it("rejects a request missing required fields", async () => {
    const body = new URLSearchParams({ click_trans_id: "111" }).toString();
    const result = await provider.verifyWebhookSignature(body, new Headers());
    expect(result.valid).toBe(false);
  });
});
