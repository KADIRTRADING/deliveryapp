"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui";
import { formatDistance, pickLocalized } from "@/lib/format";
import type { AppLocale, Restaurant, RestaurantListResponse, Address } from "@/lib/api-types";

export default function HomePage() {
  const t = useTranslations("home");
  const locale = useLocale() as AppLocale;
  const { user } = useSession();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLocation, setHasLocation] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let lat: number | undefined;
        let lng: number | undefined;

        if (user) {
          try {
            const { addresses } = await api.get<{ addresses: Address[] }>("/api/addresses");
            const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
            if (defaultAddress) {
              lat = defaultAddress.latitude;
              lng = defaultAddress.longitude;
            }
          } catch {
            // Fall through to browse mode if addresses can't be loaded.
          }
        }

        if (cancelled) return;
        setHasLocation(lat !== undefined && lng !== undefined);

        const data = await api.get<RestaurantListResponse>("/api/restaurants", {
          lat,
          lng,
          pageSize: 20,
        });
        if (!cancelled) {
          setRestaurants(data.items);
        }
      } catch {
        if (!cancelled) setError("Failed to load restaurants.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <section className="flex flex-col gap-2 rounded-xl2 bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-white">
        <h1 className="text-3xl font-bold">{t("heroTitle")}</h1>
        <p className="max-w-md text-brand-50">{t("heroSubtitle")}</p>
      </section>

      {!hasLocation && (
        <p className="rounded-xl2 border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-500">
          {t("browsingWithoutLocation")}
        </p>
      )}

      <h2 className="text-xl font-semibold text-ink-900">{t("restaurantsNearYou")}</h2>

      {loading && <LoadingBlock />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && restaurants.length === 0 && <EmptyState title={t("noRestaurants")} />}

      {!loading && !error && restaurants.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} locale={locale} />
          ))}
        </div>
      )}
    </main>
  );
}

function RestaurantCard({ restaurant, locale }: { restaurant: Restaurant; locale: AppLocale }) {
  const distance = formatDistance(restaurant.distanceMeters ?? null);
  return (
    <Link
      href={`/restaurants/${restaurant.slug}`}
      className="flex flex-col overflow-hidden rounded-xl2 border border-ink-100 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="h-32 w-full bg-ink-100" style={coverStyle(restaurant.coverUrl)} />
      <div className="flex flex-col gap-1 p-4">
        <h3 className="font-semibold text-ink-900">{pickLocalized(restaurant, locale)}</h3>
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <span>★ {restaurant.ratingAvg.toFixed(1)}</span>
          {distance && <span>· {distance}</span>}
        </div>
        {restaurant.categoryLinks.length > 0 && (
          <p className="text-xs text-ink-400">
            {restaurant.categoryLinks.map((c) => pickLocalized(c.category, locale)).join(", ")}
          </p>
        )}
      </div>
    </Link>
  );
}

function coverStyle(coverUrl: string | null): React.CSSProperties {
  return coverUrl
    ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : {};
}
