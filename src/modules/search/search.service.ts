import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeSearchText } from "@/lib/search-normalize";
import { computeServiceability } from "@/modules/restaurants/serviceability";
import { isBranchCurrentlyOpen } from "@/modules/restaurants/restaurants.service";
import type { SearchQuery } from "@/modules/search/schemas";

/**
 * Global search across restaurant name/description and product/dish name —
 * per "Create global search for restaurant name, dish/product name,
 * cuisine, category and keywords" with "Uzbek text normalization and
 * architecture for Uzbek, Russian and English."
 *
 * Matching strategy: the search query is normalized with the same
 * normalizeSearchText() used to build each record's `searchText` column
 * (see src/lib/search-normalize.ts), then matched with a case/diacritic/
 * apostrophe-insensitive `contains` filter. Individual query tokens (split
 * on whitespace) must ALL appear somewhere in the target's searchText, so
 * "uzbek plov" as a query matches "traditional uzbek plov with beef"
 * regardless of word order in future longer names.
 *
 * Restaurants are further filtered/sorted by real serviceability + distance
 * exactly as in restaurant discovery (never a fake/estimated value), and by
 * price/rating/open-now filters applied over already-serviceable results.
 */
export async function searchPlatform(query: SearchQuery) {
  const tokens = normalizeSearchText(query.q)
    .split(" ")
    .filter((t) => t.length > 0);

  const point =
    query.lat !== undefined && query.lng !== undefined
      ? { latitude: query.lat, longitude: query.lng }
      : undefined;

  const restaurantMatches = await prisma.restaurant.findMany({
    where: {
      status: "APPROVED",
      deletedAt: null,
      AND: tokens.map((token) => ({ searchText: { contains: token } })),
      ...(query.categorySlug
        ? { categoryLinks: { some: { category: { slug: query.categorySlug } } } }
        : {}),
      ...(query.minRating !== undefined ? { ratingAvg: { gte: query.minRating } } : {}),
    },
    include: {
      branches: {
        where: {
          deletedAt: null,
          isActive: true,
          ...(query.cityId ? { cityId: query.cityId } : {}),
        },
        include: { deliveryZones: true },
      },
    },
    orderBy: { ratingAvg: "desc" },
    take: 50,
  });

  const productMatches = await prisma.product.findMany({
    where: {
      deletedAt: null,
      isAvailable: true,
      AND: tokens.map((token) => ({ searchText: { contains: token } })),
      restaurant: {
        status: "APPROVED",
        deletedAt: null,
      },
      ...(query.minPrice !== undefined ? { basePrice: { gte: query.minPrice } } : {}),
      ...(query.maxPrice !== undefined ? { basePrice: { lte: query.maxPrice } } : {}),
    },
    include: {
      restaurant: {
        include: {
          branches: {
            where: {
              deletedAt: null,
              isActive: true,
              ...(query.cityId ? { cityId: query.cityId } : {}),
            },
            include: { deliveryZones: true },
          },
        },
      },
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
    },
    take: 50,
  });

  const restaurantResults = restaurantMatches
    .map((restaurant) => {
      const { isServiceable, nearestBranchDistanceMeters } = computeServiceability(
        restaurant.branches,
        point,
      );
      const isOpenNow = restaurant.branches.some((b) =>
        isBranchCurrentlyOpen(b.openingHours, b.temporarilyClosedUntil),
      );
      return { restaurant, isServiceable, nearestBranchDistanceMeters, isOpenNow };
    })
    .filter((r) => r.isServiceable)
    .filter((r) => !query.openNow || r.isOpenNow)
    .sort((a, b) => {
      if (a.nearestBranchDistanceMeters === null) return 1;
      if (b.nearestBranchDistanceMeters === null) return -1;
      return a.nearestBranchDistanceMeters - b.nearestBranchDistanceMeters;
    });

  const productResults = productMatches
    .map((product) => {
      const { isServiceable, nearestBranchDistanceMeters } = computeServiceability(
        product.restaurant.branches,
        point,
      );
      return { product, isServiceable, nearestBranchDistanceMeters };
    })
    .filter((r) => r.isServiceable);

  const total = restaurantResults.length + productResults.length;
  const start = (query.page - 1) * query.pageSize;

  const combined = [
    ...restaurantResults.map((r) => ({ type: "restaurant" as const, ...r })),
    ...productResults.map((r) => ({ type: "product" as const, ...r })),
  ];
  const pageItems = combined.slice(start, start + query.pageSize);

  return { items: pageItems, total, page: query.page, pageSize: query.pageSize };
}
