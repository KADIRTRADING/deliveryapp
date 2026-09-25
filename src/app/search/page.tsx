"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api-client";
import { EmptyState, ErrorBanner, LoadingBlock, TextInput } from "@/components/ui";
import { formatUzs, pickLocalized } from "@/lib/format";
import type { AppLocale, Product, Restaurant } from "@/lib/api-types";

interface SearchResultItem {
  type: "restaurant" | "product";
  restaurant?: Restaurant;
  product?: Product & { restaurant: Restaurant };
  isServiceable: boolean;
  nearestBranchDistanceMeters: number | null;
}

interface SearchResponse {
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function SearchPage() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await api.get<SearchResponse>("/api/search", { q: query });
      setResults(data.items);
    } catch {
      setError("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void runSearch();
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <form onSubmit={handleSearch} className="flex gap-2">
        <TextInput
          className="flex-1"
          placeholder="Search restaurants and dishes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-xl2 bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700"
        >
          {tCommon("submit")}
        </button>
      </form>

      {loading && <LoadingBlock />}
      {error && <ErrorBanner message={error} onRetry={() => void runSearch()} />}

      {!loading && searched && results.length === 0 && <EmptyState title={t("noRestaurants")} />}

      {!loading && results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map((item, idx) => (
            <li key={idx}>
              {item.type === "restaurant" && item.restaurant ? (
                <Link
                  href={`/restaurants/${item.restaurant.slug}`}
                  className="flex items-center justify-between rounded-xl2 border border-ink-100 bg-white p-4 hover:shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-ink-900">
                      {pickLocalized(item.restaurant, locale)}
                    </p>
                    <p className="text-xs text-ink-400">
                      Restaurant · ★ {item.restaurant.ratingAvg.toFixed(1)}
                    </p>
                  </div>
                </Link>
              ) : item.product ? (
                <Link
                  href={`/restaurants/${item.product.restaurant.slug}`}
                  className="flex items-center justify-between rounded-xl2 border border-ink-100 bg-white p-4 hover:shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-ink-900">
                      {pickLocalized(item.product, locale)}
                    </p>
                    <p className="text-xs text-ink-400">
                      {pickLocalized(item.product.restaurant, locale)}
                    </p>
                  </div>
                  <span className="font-medium text-brand-600">
                    {formatUzs(item.product.discountedPrice ?? item.product.basePrice, locale)}
                  </span>
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
