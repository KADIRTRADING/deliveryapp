import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * Favorites — a Favorite row is either restaurant-scoped or product-scoped,
 * never both (enforced at the application level here; the schema's two
 * separate @@unique constraints on (userId, restaurantId) and
 * (userId, productId) prevent duplicates within each kind, but cannot by
 * themselves prevent a row from setting both columns — see
 * schema.prisma's comment on the Favorite model for why).
 */

export async function addFavoriteRestaurant(userId: string, restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || restaurant.deletedAt) {
    throw ApiError.notFound("Restaurant not found");
  }

  const existing = await prisma.favorite.findUnique({
    where: { userId_restaurantId: { userId, restaurantId } },
  });
  if (existing) return existing;

  return prisma.favorite.create({ data: { userId, restaurantId } });
}

export async function removeFavoriteRestaurant(userId: string, restaurantId: string) {
  await prisma.favorite.deleteMany({ where: { userId, restaurantId } });
}

export async function addFavoriteProduct(userId: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.deletedAt) {
    throw ApiError.notFound("Product not found");
  }

  const existing = await prisma.favorite.findUnique({
    where: { userId_productId: { userId, productId } },
  });
  if (existing) return existing;

  return prisma.favorite.create({ data: { userId, productId } });
}

export async function removeFavoriteProduct(userId: string, productId: string) {
  await prisma.favorite.deleteMany({ where: { userId, productId } });
}

export async function listFavoriteRestaurants(userId: string) {
  return prisma.favorite.findMany({
    where: { userId, restaurantId: { not: null } },
    include: {
      restaurant: {
        include: { categoryLinks: { include: { category: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listFavoriteProducts(userId: string) {
  return prisma.favorite.findMany({
    where: { userId, productId: { not: null } },
    include: { product: { include: { images: { take: 1, orderBy: { sortOrder: "asc" } } } } },
    orderBy: { createdAt: "desc" },
  });
}
