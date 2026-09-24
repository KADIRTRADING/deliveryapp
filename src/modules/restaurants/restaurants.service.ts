import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { buildSearchText } from "@/lib/search-normalize";
import type { AuthSession } from "@/modules/auth/rbac";
import { isAdmin } from "@/modules/auth/rbac";
import { restaurantListQuerySchema } from "@/modules/restaurants/schemas";
import type { CreateRestaurantInput, UpdateRestaurantInput } from "@/modules/restaurants/schemas";
import { computeServiceability } from "@/modules/restaurants/serviceability";
import type { z } from "zod";

type RestaurantListQuery = z.infer<typeof restaurantListQuerySchema>;

/**
 * Create a new restaurant. Any authenticated user with the RESTAURANT_OWNER
 * role may self-service create a restaurant profile, but it always starts in
 * PENDING status — per "Admin can create, approve, suspend, edit and archive
 * restaurants", only an admin approval transitions it to APPROVED and makes
 * it visible to customers (see listServiceableRestaurants, which filters on
 * status: APPROVED).
 */
export async function createRestaurant(session: AuthSession, input: CreateRestaurantInput) {
  const existingSlug = await prisma.restaurant.findUnique({ where: { slug: input.slug } });
  if (existingSlug) {
    throw ApiError.conflict("A restaurant with this slug already exists.");
  }

  return prisma.restaurant.create({
    data: {
      slug: input.slug,
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      descriptionUz: input.descriptionUz ?? null,
      descriptionRu: input.descriptionRu ?? null,
      descriptionEn: input.descriptionEn ?? null,
      searchText: buildSearchText(
        input.nameUz,
        input.nameRu,
        input.nameEn,
        input.descriptionUz,
        input.descriptionRu,
        input.descriptionEn,
      ),
      status: "PENDING",
      restaurantUsers: {
        create: [{ userId: session.user.id, role: "OWNER" }],
      },
      categoryLinks: {
        create: input.categoryIds.map((categoryId) => ({ categoryId })),
      },
    },
    include: { categoryLinks: { include: { category: true } }, branches: true },
  });
}

export async function updateRestaurant(restaurantId: string, input: UpdateRestaurantInput) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || restaurant.deletedAt) {
    throw ApiError.notFound("Restaurant not found");
  }

  const searchText = buildSearchText(
    input.nameUz ?? restaurant.nameUz,
    input.nameRu ?? restaurant.nameRu,
    input.nameEn ?? restaurant.nameEn,
    input.descriptionUz !== undefined ? input.descriptionUz : restaurant.descriptionUz,
    input.descriptionRu !== undefined ? input.descriptionRu : restaurant.descriptionRu,
    input.descriptionEn !== undefined ? input.descriptionEn : restaurant.descriptionEn,
  );

  return prisma.$transaction(async (tx) => {
    if (input.categoryIds) {
      await tx.restaurantCategoryLink.deleteMany({ where: { restaurantId } });
      await tx.restaurantCategoryLink.createMany({
        data: input.categoryIds.map((categoryId) => ({ restaurantId, categoryId })),
      });
    }

    return tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        nameUz: input.nameUz,
        nameRu: input.nameRu,
        nameEn: input.nameEn,
        descriptionUz: input.descriptionUz,
        descriptionRu: input.descriptionRu,
        descriptionEn: input.descriptionEn,
        logoUrl: input.logoUrl,
        coverUrl: input.coverUrl,
        searchText,
      },
      include: { categoryLinks: { include: { category: true } }, branches: true },
    });
  });
}

export async function updateRestaurantStatus(
  restaurantId: string,
  status: "PENDING" | "APPROVED" | "SUSPENDED" | "ARCHIVED",
) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || restaurant.deletedAt) {
    throw ApiError.notFound("Restaurant not found");
  }
  return prisma.restaurant.update({ where: { id: restaurantId }, data: { status } });
}

/**
 * Fetch a restaurant for a management/dashboard context (owner/staff/admin).
 * Unlike the public getRestaurantBySlug below, this does not filter by
 * status — staff need to see PENDING/SUSPENDED restaurants they manage.
 */
export async function getRestaurantForManagement(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      branches: { where: { deletedAt: null } },
      categoryLinks: { include: { category: true } },
    },
  });
  if (!restaurant || restaurant.deletedAt) {
    throw ApiError.notFound("Restaurant not found");
  }
  return restaurant;
}

/** Public restaurant detail page lookup — only ever returns APPROVED, non-deleted restaurants. */
export async function getRestaurantBySlug(slug: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    include: {
      branches: { where: { deletedAt: null, isActive: true } },
      categoryLinks: { include: { category: true } },
    },
  });
  if (!restaurant || restaurant.deletedAt || restaurant.status !== "APPROVED") {
    throw ApiError.notFound("Restaurant not found");
  }
  return restaurant;
}

export function isBranchCurrentlyOpen(
  openingHours: unknown,
  temporarilyClosedUntil: Date | null,
  now: Date = new Date(),
): boolean {
  if (temporarilyClosedUntil && temporarilyClosedUntil.getTime() > now.getTime()) {
    return false;
  }

  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const dayKey = dayKeys[now.getDay()];
  const schedule = (openingHours as Record<string, [string, string][]> | null)?.[dayKey ?? "mon"];
  if (!schedule || schedule.length === 0) return false;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return schedule.some(([open, close]) => {
    const [openH, openM] = open.split(":").map(Number);
    const [closeH, closeM] = close.split(":").map(Number);
    const openMinutes = (openH ?? 0) * 60 + (openM ?? 0);
    const closeMinutes = (closeH ?? 0) * 60 + (closeM ?? 0);
    return minutesNow >= openMinutes && minutesNow <= closeMinutes;
  });
}

/**
 * Restaurant discovery, filtered to only restaurants that can ACTUALLY
 * deliver to the customer's selected coordinates — per "Search results
 * should prioritize restaurants that can actually deliver to the customer's
 * selected location" and "Do not use fake distances or delivery estimates."
 *
 * A branch is serviceable for a given point if at least one of its active
 * delivery zones contains that point (radius or polygon test). Restaurants
 * with no serviceable branch for the given coordinates are excluded
 * entirely, not merely deprioritized — showing a restaurant a customer
 * cannot actually order from would violate the platform's core promise.
 *
 * If no coordinates are supplied, falls back to a city-scoped browse (no
 * serviceability claim is made or implied — the UI is expected to prompt
 * for a delivery location before checkout is possible regardless).
 */
export async function listServiceableRestaurants(query: RestaurantListQuery) {
  const { lat, lng, cityId, categorySlug, page, pageSize } = query;

  const restaurants = await prisma.restaurant.findMany({
    where: {
      status: "APPROVED",
      deletedAt: null,
      ...(categorySlug ? { categoryLinks: { some: { category: { slug: categorySlug } } } } : {}),
      branches: {
        some: {
          deletedAt: null,
          isActive: true,
          ...(cityId ? { cityId } : {}),
        },
      },
    },
    include: {
      branches: {
        where: { deletedAt: null, isActive: true },
        include: { deliveryZones: { where: { isActive: true } } },
      },
      categoryLinks: { include: { category: true } },
    },
    orderBy: { ratingAvg: "desc" },
  });

  const point =
    lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : undefined;

  const withServiceability = restaurants.map((restaurant) => {
    const { isServiceable, nearestBranchDistanceMeters } = computeServiceability(
      restaurant.branches,
      point,
    );
    return { restaurant, isServiceable, nearestBranchDistanceMeters };
  });

  const serviceable = withServiceability.filter((r) => r.isServiceable);
  serviceable.sort((a, b) => {
    if (a.nearestBranchDistanceMeters === null) return 1;
    if (b.nearestBranchDistanceMeters === null) return -1;
    return a.nearestBranchDistanceMeters - b.nearestBranchDistanceMeters;
  });

  const total = serviceable.length;
  const start = (page - 1) * pageSize;
  const pageItems = serviceable.slice(start, start + pageSize);

  return {
    items: pageItems.map(({ restaurant, nearestBranchDistanceMeters }) => ({
      ...restaurant,
      distanceMeters: nearestBranchDistanceMeters,
    })),
    total,
    page,
    pageSize,
  };
}

export function canManageRestaurant(session: AuthSession): boolean {
  return isAdmin(session) || session.user.roles.includes("RESTAURANT_OWNER");
}
