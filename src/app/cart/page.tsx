"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCartBadge } from "@/components/cart-provider";
import { EmptyState, LoadingBlock, PrimaryButton } from "@/components/ui";
import { pickLocalized } from "@/lib/format";
import type { AppLocale } from "@/lib/api-types";

export default function CartListPage() {
  const t = useTranslations("cart");
  const locale = useLocale() as AppLocale;
  const { carts, isLoading } = useCartBadge();

  if (isLoading) return <LoadingBlock />;

  if (carts.length === 0) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl font-bold text-ink-900">{t("title")}</h1>
        <EmptyState title={t("empty")} hint={t("emptyHint")} />
        <Link href="/">
          <PrimaryButton type="button">{t("browseRestaurants")}</PrimaryButton>
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-ink-900">{t("yourCarts")}</h1>
      <div className="flex flex-col gap-3">
        {carts.map((cart) => {
          const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
          return (
            <Link
              key={cart.id}
              href={`/cart/${cart.restaurantId}`}
              className="flex items-center justify-between rounded-xl2 border border-ink-100 bg-white p-4 hover:shadow-sm"
            >
              <span className="font-medium text-ink-900">
                {pickLocalized(cart.restaurant, locale)}
              </span>
              <span className="text-sm text-ink-500">{t("itemsCount", { count: itemCount })}</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
