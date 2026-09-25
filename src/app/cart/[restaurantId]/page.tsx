"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiRequestError } from "@/lib/api-client";
import { useCartBadge } from "@/components/cart-provider";
import {
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";
import { formatUzs, pickLocalized } from "@/lib/format";
import type { AppLocale, CartResponse } from "@/lib/api-types";

export default function CartDetailPage() {
  const params = useParams<{ restaurantId: string }>();
  const router = useRouter();
  const t = useTranslations("cart");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const { refreshCarts } = useCartBadge();

  const [data, setData] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingItemId, setMutatingItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<CartResponse>(`/api/cart/${params.restaurantId}`);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load cart.");
    } finally {
      setLoading(false);
    }
  }, [params.restaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateQuantity(itemId: string, quantity: number) {
    setMutatingItemId(itemId);
    try {
      const result = await api.patch<CartResponse>(
        `/api/cart/${params.restaurantId}/items/${itemId}`,
        { quantity },
      );
      setData(result);
      await refreshCarts();
    } finally {
      setMutatingItemId(null);
    }
  }

  async function removeItem(itemId: string) {
    setMutatingItemId(itemId);
    try {
      const result = await api.delete<CartResponse>(
        `/api/cart/${params.restaurantId}/items/${itemId}`,
      );
      setData(result);
      await refreshCarts();
    } finally {
      setMutatingItemId(null);
    }
  }

  async function clearCart() {
    if (!confirm(t("clearConfirm"))) return;
    await api.delete(`/api/cart/${params.restaurantId}`);
    await refreshCarts();
    router.push("/cart");
  }

  if (loading) return <LoadingBlock />;
  if (error)
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  if (!data?.cart || data.cart.items.length === 0) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <EmptyState title={t("empty")} hint={t("emptyHint")} />
        <Link href="/">
          <PrimaryButton type="button">{t("browseRestaurants")}</PrimaryButton>
        </Link>
      </main>
    );
  }

  const { cart, pricing } = data;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">
          {pickLocalized(cart.restaurant, locale)}
        </h1>
        <button type="button" onClick={clearCart} className="text-sm text-red-600 hover:underline">
          {t("clear")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {cart.items.map((item) => {
          const line = pricing.lines.find((l) => l.cartItemId === item.id);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl2 border border-ink-100 bg-white p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium text-ink-900">
                  {pickLocalized(item.product, locale)}
                </span>
                {item.variant && (
                  <span className="text-xs text-ink-400">
                    {pickLocalized(item.variant, locale)}
                  </span>
                )}
                {item.modifiers.length > 0 && (
                  <span className="text-xs text-ink-400">
                    {item.modifiers.map((m) => pickLocalized(m.modifierOption, locale)).join(", ")}
                  </span>
                )}
                {item.notes && (
                  <span className="text-xs italic text-ink-400">&ldquo;{item.notes}&rdquo;</span>
                )}
                <span className="font-semibold text-brand-600">
                  {line ? formatUzs(line.lineTotal, locale) : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SecondaryButton
                  type="button"
                  disabled={mutatingItemId === item.id}
                  onClick={() =>
                    item.quantity > 1
                      ? updateQuantity(item.id, item.quantity - 1)
                      : removeItem(item.id)
                  }
                >
                  −
                </SecondaryButton>
                <span className="w-6 text-center">{item.quantity}</span>
                <SecondaryButton
                  type="button"
                  disabled={mutatingItemId === item.id}
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                >
                  +
                </SecondaryButton>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  disabled={mutatingItemId === item.id}
                  className="ml-2 text-xs text-red-500 hover:underline"
                >
                  {tCommon("remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-ink-100 pt-4">
        <span className="font-medium text-ink-700">{t("subtotal")}</span>
        <span className="text-lg font-bold text-ink-900">
          {formatUzs(pricing.subtotalAmount, locale)}
        </span>
      </div>

      <Link href={`/checkout/${cart.restaurantId}`}>
        <PrimaryButton type="button" className="w-full justify-center">
          {t("checkoutButton")}
        </PrimaryButton>
      </Link>
    </main>
  );
}
