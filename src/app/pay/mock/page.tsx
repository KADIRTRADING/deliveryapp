"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, ApiRequestError, ensureCsrfCookie } from "@/lib/api-client";
import { Card, ErrorBanner, LoadingBlock, PrimaryButton, SecondaryButton } from "@/components/ui";
import { formatUzs } from "@/lib/format";

/**
 * Dev-only mock payment gateway UI. This is the page MockPaymentProvider's
 * `initiatePayment` redirects the browser to (see
 * src/modules/payments/mock-provider.ts) — a real Payme/Click checkout
 * page would live entirely on the provider's own domain; this local stand-
 * in exists so the full ONLINE-payment order flow can be exercised end to
 * end without any real gateway or outbound network access, matching how
 * the backend's own dev-only completion endpoint
 * (/api/payments/mock/complete) already works.
 */
function MockPaymentPageInner() {
  const t = useTranslations("payment");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId") ?? "";
  const amount = Number(searchParams.get("amount") ?? 0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete(outcome: "success" | "failure") {
    setSubmitting(true);
    setError(null);
    try {
      await ensureCsrfCookie();
      await api.post("/api/payments/mock/complete", { orderId, outcome });
      router.push(`/orders/${orderId}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : tCommon("unknownError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!orderId) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <ErrorBanner message="Missing order reference." />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <Card className="flex flex-col gap-4">
        <h1 className="text-lg font-bold text-ink-900">{t("mockTitle")}</h1>
        <p className="text-sm text-ink-500">{t("mockDescription")}</p>
        <p className="text-2xl font-bold text-brand-600">{formatUzs(amount)}</p>

        {error && <ErrorBanner message={error} />}

        <PrimaryButton
          type="button"
          onClick={() => complete("success")}
          loading={submitting}
          className="w-full justify-center"
        >
          {t("confirmSuccess")}
        </PrimaryButton>
        <SecondaryButton
          type="button"
          onClick={() => complete("failure")}
          disabled={submitting}
          className="w-full justify-center"
        >
          {t("confirmFailure")}
        </SecondaryButton>
      </Card>
    </main>
  );
}

export default function MockPaymentPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <MockPaymentPageInner />
    </Suspense>
  );
}
