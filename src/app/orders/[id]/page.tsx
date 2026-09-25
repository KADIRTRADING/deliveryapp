"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiRequestError } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { ErrorBanner, LoadingBlock, PrimaryButton, SecondaryButton } from "@/components/ui";
import { formatUzs, pickLocalized } from "@/lib/format";
import type { AppLocale, Order, OrderStatus } from "@/lib/api-types";

const CANCELLABLE_STATUSES: OrderStatus[] = ["PENDING", "PAYMENT_PENDING", "PAID", "ACCEPTED"];
const TERMINAL_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("orders");
  const tStatus = useTranslations("orderStatus");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const { user, isLoading: sessionLoading } = useSession();

  const [order, setOrder] = useState<Order | null>(null);
  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ order: Order }>(`/api/orders/${params.id}`);
      setOrder(data.order);
      setLiveStatus(data.order.status);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load order.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) void load();
  }, [sessionLoading, user, router, load]);

  useEffect(() => {
    if (!order || TERMINAL_STATUSES.includes(order.status)) return;

    const es = new EventSource(`/api/orders/${order.id}/stream`);
    eventSourceRef.current = es;

    es.addEventListener("status", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { status: OrderStatus };
        setLiveStatus(payload.status);
        if (TERMINAL_STATUSES.includes(payload.status)) {
          es.close();
        }
      } catch {
        // Ignore malformed events.
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects on transient errors; nothing to do here.
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [order]);

  async function handleCancel() {
    if (!order || !confirm(t("cancelConfirm"))) return;
    setCancelling(true);
    try {
      await api.post(`/api/orders/${order.id}/cancel`);
      setLiveStatus("CANCELLED");
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : tCommon("unknownError"));
    } finally {
      setCancelling(false);
    }
  }

  async function handlePayNow() {
    if (!order) return;
    try {
      const { payment } = await api.post<{ payment: { redirectUrl: string } }>(
        `/api/payments/orders/${order.id}/initiate`,
      );
      window.location.href = payment.redirectUrl;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : tCommon("unknownError"));
    }
  }

  if (sessionLoading || loading) return <LoadingBlock />;
  if (error && !order)
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  if (!order) return null;

  const currentStatus = liveStatus ?? order.status;
  const canCancel = CANCELLABLE_STATUSES.includes(currentStatus);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href="/orders" className="text-sm text-brand-600 hover:underline">
        ← {t("backToOrders")}
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">
          {t("orderNumber")} {order.orderNumber}
        </h1>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          {tStatus(currentStatus)}
        </span>
      </div>

      <p className="text-sm text-ink-500">{pickLocalized(order.restaurant, locale)}</p>

      {error && <ErrorBanner message={error} />}

      <section className="flex flex-col gap-2 rounded-xl2 border border-ink-100 bg-white p-4">
        <h2 className="font-semibold text-ink-900">{t("items")}</h2>
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-ink-600">
            <span>
              {item.quantity}× {item.productNameSnapshot}
              {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ""}
            </span>
            <span>{formatUzs(item.lineTotal, locale)}</span>
          </div>
        ))}
        <div className="mt-2 flex flex-col gap-1 border-t border-ink-100 pt-2 text-sm text-ink-600">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatUzs(order.subtotalAmount, locale)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>−{formatUzs(order.discountAmount, locale)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Delivery fee</span>
            <span>{formatUzs(order.deliveryFeeAmount, locale)}</span>
          </div>
          <div className="flex justify-between font-bold text-ink-900">
            <span>{t("total")}</span>
            <span>{formatUzs(order.totalAmount, locale)}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl2 border border-ink-100 bg-white p-4">
        <h2 className="font-semibold text-ink-900">Delivery address</h2>
        <p className="text-sm text-ink-600">
          {order.addressSnapshot.addressLine}, {order.addressSnapshot.city}
        </p>
        <p className="text-sm text-ink-600">
          {order.recipientName} · {order.recipientPhone}
        </p>
      </section>

      <section className="flex flex-col gap-2 rounded-xl2 border border-ink-100 bg-white p-4">
        <h2 className="font-semibold text-ink-900">{t("statusHistory")}</h2>
        <ol className="flex flex-col gap-1 text-sm text-ink-600">
          {order.statusHistory.map((entry) => (
            <li key={entry.id} className="flex justify-between">
              <span>{tStatus(entry.status)}</span>
              <span className="text-ink-400">
                {new Date(entry.createdAt).toLocaleString(locale)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex gap-3">
        {order.paymentMethod === "ONLINE" && order.status === "PAYMENT_PENDING" && (
          <PrimaryButton type="button" onClick={handlePayNow}>
            {t("payNow")}
          </PrimaryButton>
        )}
        {canCancel && (
          <SecondaryButton type="button" onClick={handleCancel} disabled={cancelling}>
            {t("cancelOrder")}
          </SecondaryButton>
        )}
      </div>
    </main>
  );
}
