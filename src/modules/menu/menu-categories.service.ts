import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { CreateMenuCategoryInput, UpdateMenuCategoryInput } from "@/modules/menu/schemas";

export async function listMenuCategories(
  restaurantId: string,
  opts?: { includeInactive?: boolean },
) {
  return prisma.menuCategory.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      ...(opts?.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createMenuCategory(restaurantId: string, input: CreateMenuCategoryInput) {
  return prisma.menuCategory.create({
    data: {
      restaurantId,
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      sortOrder: input.sortOrder,
    },
  });
}

export async function updateMenuCategory(categoryId: string, input: UpdateMenuCategoryInput) {
  const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
  if (!existing || existing.deletedAt) {
    throw ApiError.notFound("Menu category not found");
  }
  return prisma.menuCategory.update({
    where: { id: categoryId },
    data: {
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
}

export async function deleteMenuCategory(categoryId: string) {
  const existing = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
  if (!existing || existing.deletedAt) {
    throw ApiError.notFound("Menu category not found");
  }

  const productCount = await prisma.product.count({
    where: { menuCategoryId: categoryId, deletedAt: null },
  });
  if (productCount > 0) {
    throw ApiError.conflict(
      "This category still has products assigned to it. Move or remove them first.",
    );
  }

  await prisma.menuCategory.update({
    where: { id: categoryId },
    data: { deletedAt: new Date(), isActive: false },
  });
}
