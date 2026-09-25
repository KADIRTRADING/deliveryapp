import "server-only";
import { env, assertProductionCredentials } from "@/lib/env";
import { MockPaymentProvider } from "@/modules/payments/mock-provider";
import { PaymePaymentProvider } from "@/modules/payments/payme-provider";
import { ClickPaymentProvider } from "@/modules/payments/click-provider";
import type { PaymentProvider } from "@/modules/payments/payment-provider";
import type { PaymentProviderKind } from "@prisma/client";

export type {
  PaymentProvider,
  InitiatePaymentInput,
  WebhookVerificationResult,
} from "@/modules/payments/payment-provider";

const providerCache = new Map<PaymentProviderKind, PaymentProvider>();

/**
 * Resolve the payment provider for a given kind, exactly like
 * getMapProvider/getStorageProvider/getSmsProvider elsewhere in this
 * codebase: the concrete adapter is chosen purely by which provider the
 * caller asks for (usually env.PAYMENT_DEFAULT_PROVIDER, but a specific
 * order's `Payment.provider` value on repeat webhook deliveries), never
 * hardcoded at a call site.
 */
export function getPaymentProviderByKind(kind: PaymentProviderKind): PaymentProvider {
  const cached = providerCache.get(kind);
  if (cached) return cached;

  let provider: PaymentProvider;
  switch (kind) {
    case "PAYME":
      assertProductionCredentials("Payme", [env.PAYME_MERCHANT_ID, env.PAYME_SECRET_KEY]);
      provider = new PaymePaymentProvider();
      break;
    case "CLICK":
      assertProductionCredentials("Click", [
        env.CLICK_MERCHANT_ID,
        env.CLICK_SERVICE_ID,
        env.CLICK_SECRET_KEY,
      ]);
      provider = new ClickPaymentProvider();
      break;
    case "MOCK":
    case "CASH":
    default:
      provider = new MockPaymentProvider();
      break;
  }

  providerCache.set(kind, provider);
  return provider;
}

/** The provider used to initiate a fresh ONLINE payment, per PAYMENT_DEFAULT_PROVIDER. */
export function getDefaultPaymentProvider(): PaymentProvider {
  const kindMap: Record<string, PaymentProviderKind> = {
    mock: "MOCK",
    payme: "PAYME",
    click: "CLICK",
  };
  return getPaymentProviderByKind(kindMap[env.PAYMENT_DEFAULT_PROVIDER] ?? "MOCK");
}
