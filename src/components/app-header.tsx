"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useSession } from "@/components/session-provider";
import { useCartBadge } from "@/components/cart-provider";
import { useLocaleSwitcher } from "@/lib/use-locale";
import type { AppLocale } from "@/lib/api-types";

const LOCALES: AppLocale[] = ["uz", "ru", "en"];

export function AppHeader() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const { user } = useSession();
  const { totalItemCount } = useCartBadge();
  const { setLocale } = useLocaleSwitcher();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-600">
          {tCommon("appName")}
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium text-ink-700">
          <Link href="/" className="hidden hover:text-brand-600 sm:inline">
            {t("home")}
          </Link>
          <Link href="/search" className="hidden hover:text-brand-600 sm:inline">
            {t("search")}
          </Link>
          <Link href="/cart" className="relative hover:text-brand-600">
            {t("cart")}
            {totalItemCount > 0 && (
              <span className="absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-xs font-bold text-white">
                {totalItemCount}
              </span>
            )}
          </Link>
          {user && (
            <>
              <Link href="/orders" className="hover:text-brand-600">
                {t("orders")}
              </Link>
              <Link href="/addresses" className="hidden hover:text-brand-600 sm:inline">
                {t("addresses")}
              </Link>
            </>
          )}

          <div className="flex items-center gap-1 rounded-full border border-ink-100 p-1 text-xs">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLocale(l)}
                className={`rounded-full px-2 py-1 uppercase transition ${
                  l === locale ? "bg-brand-600 text-white" : "text-ink-500 hover:bg-ink-50"
                }`}
                aria-current={l === locale}
              >
                {l}
              </button>
            ))}
          </div>

          {user ? (
            <Link
              href="/profile"
              className="rounded-full bg-ink-50 px-3 py-1.5 text-ink-700 hover:bg-ink-100"
            >
              {user.firstName}
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700"
            >
              {t("login")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
