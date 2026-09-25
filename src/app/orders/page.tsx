"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui";
import { formatUzs, pickLocalized } from "@/lib/format";
import type { AppLocale, OrderListResponse } from "@/lib/api-types";

export default function OrdersPage() {
  const t = useTranslations("orders");
  const tStatus = useTranslations("orderStatus");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  const [data, setData] = useState<OrderListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<OrderListResponse>("/api/orders");
      setData(result);
    } catch {
      setError("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) void load();
  }, [sessionLoading, user, router, load]);

  if (sessionLoading || loading) return <LoadingBlock />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-ink-900">{t("title")}</h1>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {!error && data?.items.length === 0 && <EmptyState title={t("empty")} />}

      {!error && data && data.items.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.items.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex flex-col gap-1 rounded-xl2 border border-ink-100 bg-white p-4 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-900">
                  {pickLocalized(order.restaurant, locale)}
                </span>
                <span className="text-xs text-ink-400">
                  {t("orderNumber")} {order.orderNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="rounded-full bg-ink-50 px-2 py-0.5 text-ink-600">
                  {tStatus(order.status)}
                </span>
                <span className="font-semibold text-brand-600">
                  {formatUzs(order.totalAmount, locale)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
