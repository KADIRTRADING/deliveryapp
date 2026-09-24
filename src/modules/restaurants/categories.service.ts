import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * RestaurantCategory ("cuisine/category" tags such as "Uzbek", "Fast Food",
 * "Pizza") — reference data shown in home-screen category browsing and used
 * as a search/filter facet. Full admin CRUD (edit/reorder/icon upload) lands
 * in Phase 6; this Phase 2 slice covers the read path plus a minimal
 * admin-only create, since restaurants need at least one category to exist
 * before they can be tagged.
 */

export async function listCategories() {
  return prisma.restaurantCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameUz: "asc" }],
  });
}

export async function createCategory(input: {
  slug: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  iconUrl?: string | null;
  sortOrder?: number;
}) {
  const existing = await prisma.restaurantCategory.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw ApiError.conflict("A category with this slug already exists.");
  }
  return prisma.restaurantCategory.create({
    data: {
      slug: input.slug,
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      iconUrl: input.iconUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}
