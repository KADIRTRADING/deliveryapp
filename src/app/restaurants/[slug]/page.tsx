"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiRequestError } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { useCartBadge } from "@/components/cart-provider";
import { EmptyState, ErrorBanner, LoadingBlock } from "@/components/ui";
import { formatUzs, pickLocalized, pickLocalizedDescription } from "@/lib/format";
import { ProductModal } from "@/components/product-modal";
import type { AppLocale, MenuCategoryWithProducts, Product, Restaurant } from "@/lib/api-types";

export default function RestaurantPage() {
  const params = useParams<{ slug: string }>();
  const t = useTranslations("restaurant");
  const locale = useLocale() as AppLocale;
  const { user } = useSession();
  const { refreshCarts } = useCartBadge();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuCategories, setMenuCategories] = useState<MenuCategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const restaurantData = await api.get<{ restaurant: Restaurant }>(
        `/api/restaurants/slug/${params.slug}`,
      );
      setRestaurant(restaurantData.restaurant);

      const menuData = await api.get<{ menuCategories: MenuCategoryWithProducts[] }>(
        `/api/restaurants/slug/${params.slug}/menu`,
      );
      setMenuCategories(menuData.menuCategories);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? t("notFound")
          : "Failed to load restaurant.",
      );
    } finally {
      setLoading(false);
    }
  }, [params.slug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAddToCart(input: {
    productId: string;
    variantId: string | null;
    modifierOptionIds: string[];
    quantity: number;
    notes: string | null;
  }) {
    if (!restaurant) return;
    setAddError(null);
    try {
      await api.post(`/api/cart/${restaurant.id}`, input);
      await refreshCarts();
      setSelectedProduct(null);
    } catch (err) {
      setAddError(err instanceof ApiRequestError ? err.message : "Failed to add item.");
    }
  }

  if (loading) return <LoadingBlock />;
  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );
  if (!restaurant) return null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="h-40 w-full rounded-xl2 bg-ink-100" style={coverStyle(restaurant.coverUrl)} />

      <div>
        <h1 className="text-2xl font-bold text-ink-900">{pickLocalized(restaurant, locale)}</h1>
        {pickLocalizedDescription(restaurant, locale) && (
          <p className="mt-1 text-sm text-ink-500">
            {pickLocalizedDescription(restaurant, locale)}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-sm text-ink-500">
          <span>
            ★ {restaurant.ratingAvg.toFixed(1)} ({restaurant.ratingCount})
          </span>
        </div>
      </div>

      {!user && (
        <p className="rounded-xl2 border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-500">
          Sign in to add items to your cart.
        </p>
      )}

      {addError && <ErrorBanner message={addError} />}

      {menuCategories.length === 0 && <EmptyState title={t("noMenu")} />}

      <div className="flex flex-col gap-8">
        {menuCategories.map((category) => (
          <section key={category.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-ink-900">
              {pickLocalized(category, locale)}
            </h2>
            <div className="flex flex-col gap-3">
              {category.products.map((product) => {
                const coverImage = product.images[0];
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => user && setSelectedProduct(product)}
                    disabled={!user || !product.isAvailable}
                    className="flex items-center justify-between rounded-xl2 border border-ink-100 bg-white p-4 text-left transition hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-ink-900">
                        {pickLocalized(product, locale)}
                      </span>
                      {pickLocalizedDescription(product, locale) && (
                        <span className="text-sm text-ink-400">
                          {pickLocalizedDescription(product, locale)}
                        </span>
                      )}
                      <span className="font-semibold text-brand-600">
                        {formatUzs(product.discountedPrice ?? product.basePrice, locale)}
                        {product.discountedPrice && (
                          <span className="ml-2 text-xs text-ink-300 line-through">
                            {formatUzs(product.basePrice, locale)}
                          </span>
                        )}
                      </span>
                    </div>
                    {coverImage && (
                      <img
                        src={coverImage.url}
                        alt={pickLocalized(product, locale)}
                        className="h-16 w-16 rounded-xl2 object-cover"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAdd={handleAddToCart}
        />
      )}
    </main>
  );
}

function coverStyle(coverUrl: string | null): React.CSSProperties {
  return coverUrl
    ? { backgroundImage: `url(${coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : {};
}
