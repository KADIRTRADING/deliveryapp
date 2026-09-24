import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { buildSearchText } from "@/lib/search-normalize";
import type {
  CreateProductInput,
  UpdateProductInput,
  AddProductImageInput,
} from "@/modules/menu/schemas";

async function assertMenuCategoryBelongsToRestaurant(restaurantId: string, menuCategoryId: string) {
  const category = await prisma.menuCategory.findUnique({ where: { id: menuCategoryId } });
  if (!category || category.deletedAt || category.restaurantId !== restaurantId) {
    throw ApiError.badRequest("The selected menu category does not belong to this restaurant.");
  }
}

function buildProductSearchText(input: {
  nameUz: string;
  nameRu: string;
  nameEn: string;
  descriptionUz?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
}) {
  return buildSearchText(
    input.nameUz,
    input.nameRu,
    input.nameEn,
    input.descriptionUz,
    input.descriptionRu,
    input.descriptionEn,
  );
}

export async function listProducts(
  restaurantId: string,
  opts?: { menuCategoryId?: string; includeUnavailable?: boolean },
) {
  return prisma.product.findMany({
    where: {
      restaurantId,
      deletedAt: null,
      ...(opts?.menuCategoryId ? { menuCategoryId: opts.menuCategoryId } : {}),
      ...(opts?.includeUnavailable ? {} : { isAvailable: true }),
    },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } } },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getProduct(restaurantId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, restaurantId, deletedAt: null },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { sortOrder: "asc" } },
      modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!product) {
    throw ApiError.notFound("Product not found");
  }
  return product;
}

export async function createProduct(restaurantId: string, input: CreateProductInput) {
  await assertMenuCategoryBelongsToRestaurant(restaurantId, input.menuCategoryId);

  return prisma.product.create({
    data: {
      restaurantId,
      menuCategoryId: input.menuCategoryId,
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      descriptionUz: input.descriptionUz ?? null,
      descriptionRu: input.descriptionRu ?? null,
      descriptionEn: input.descriptionEn ?? null,
      basePrice: input.basePrice,
      discountedPrice: input.discountedPrice ?? null,
      isAvailable: input.isAvailable,
      sortOrder: input.sortOrder,
      searchText: buildProductSearchText(input),
      variants: {
        create: input.variants.map((v) => ({
          nameUz: v.nameUz,
          nameRu: v.nameRu,
          nameEn: v.nameEn,
          priceDelta: v.priceDelta,
          isDefault: v.isDefault,
          isAvailable: v.isAvailable,
          sortOrder: v.sortOrder,
        })),
      },
      modifierGroups: {
        create: input.modifierGroups.map((g) => ({
          nameUz: g.nameUz,
          nameRu: g.nameRu,
          nameEn: g.nameEn,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          isRequired: g.isRequired,
          sortOrder: g.sortOrder,
          options: {
            create: g.options.map((o) => ({
              nameUz: o.nameUz,
              nameRu: o.nameRu,
              nameEn: o.nameEn,
              priceDelta: o.priceDelta,
              isAvailable: o.isAvailable,
              sortOrder: o.sortOrder,
            })),
          },
        })),
      },
    },
    include: {
      images: true,
      variants: true,
      modifierGroups: { include: { options: true } },
    },
  });
}

/**
 * Update a product's scalar fields and, if `variants`/`modifierGroups` are
 * supplied, fully replace the existing nested collections with the supplied
 * ones (existing rows not present in the input — matched by `id` — are
 * deleted; rows without an `id` are created; rows with an `id` are updated).
 * This "diff by id" strategy avoids the far riskier alternative of deleting
 * everything and recreating it (which would break FK references from
 * existing CartItem/OrderItem rows to variants/modifier options that were
 * meant to be merely edited, not replaced).
 */
export async function updateProduct(
  restaurantId: string,
  productId: string,
  input: UpdateProductInput,
) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, restaurantId, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound("Product not found");
  }

  if (input.menuCategoryId) {
    await assertMenuCategoryBelongsToRestaurant(restaurantId, input.menuCategoryId);
  }

  const mergedForSearch = {
    nameUz: input.nameUz ?? existing.nameUz,
    nameRu: input.nameRu ?? existing.nameRu,
    nameEn: input.nameEn ?? existing.nameEn,
    descriptionUz: input.descriptionUz !== undefined ? input.descriptionUz : existing.descriptionUz,
    descriptionRu: input.descriptionRu !== undefined ? input.descriptionRu : existing.descriptionRu,
    descriptionEn: input.descriptionEn !== undefined ? input.descriptionEn : existing.descriptionEn,
  };

  return prisma.$transaction(async (tx) => {
    if (input.variants) {
      const keepIds = input.variants.filter((v) => v.id).map((v) => v.id as string);
      await tx.productVariant.deleteMany({
        where: { productId, id: { notIn: keepIds.length > 0 ? keepIds : ["__none__"] } },
      });
      for (const v of input.variants) {
        if (v.id) {
          await tx.productVariant.update({
            where: { id: v.id },
            data: {
              nameUz: v.nameUz,
              nameRu: v.nameRu,
              nameEn: v.nameEn,
              priceDelta: v.priceDelta,
              isDefault: v.isDefault,
              isAvailable: v.isAvailable,
              sortOrder: v.sortOrder,
            },
          });
        } else {
          await tx.productVariant.create({
            data: {
              productId,
              nameUz: v.nameUz,
              nameRu: v.nameRu,
              nameEn: v.nameEn,
              priceDelta: v.priceDelta,
              isDefault: v.isDefault,
              isAvailable: v.isAvailable,
              sortOrder: v.sortOrder,
            },
          });
        }
      }
    }

    if (input.modifierGroups) {
      const keepGroupIds = input.modifierGroups.filter((g) => g.id).map((g) => g.id as string);
      await tx.modifierGroup.deleteMany({
        where: {
          productId,
          id: { notIn: keepGroupIds.length > 0 ? keepGroupIds : ["__none__"] },
        },
      });

      for (const g of input.modifierGroups) {
        const group = g.id
          ? await tx.modifierGroup.update({
              where: { id: g.id },
              data: {
                nameUz: g.nameUz,
                nameRu: g.nameRu,
                nameEn: g.nameEn,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                isRequired: g.isRequired,
                sortOrder: g.sortOrder,
              },
            })
          : await tx.modifierGroup.create({
              data: {
                productId,
                nameUz: g.nameUz,
                nameRu: g.nameRu,
                nameEn: g.nameEn,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                isRequired: g.isRequired,
                sortOrder: g.sortOrder,
              },
            });

        const keepOptionIds = g.options.filter((o) => o.id).map((o) => o.id as string);
        await tx.modifierOption.deleteMany({
          where: {
            modifierGroupId: group.id,
            id: { notIn: keepOptionIds.length > 0 ? keepOptionIds : ["__none__"] },
          },
        });

        for (const o of g.options) {
          if (o.id) {
            await tx.modifierOption.update({
              where: { id: o.id },
              data: {
                nameUz: o.nameUz,
                nameRu: o.nameRu,
                nameEn: o.nameEn,
                priceDelta: o.priceDelta,
                isAvailable: o.isAvailable,
                sortOrder: o.sortOrder,
              },
            });
          } else {
            await tx.modifierOption.create({
              data: {
                modifierGroupId: group.id,
                nameUz: o.nameUz,
                nameRu: o.nameRu,
                nameEn: o.nameEn,
                priceDelta: o.priceDelta,
                isAvailable: o.isAvailable,
                sortOrder: o.sortOrder,
              },
            });
          }
        }
      }
    }

    return tx.product.update({
      where: { id: productId },
      data: {
        menuCategoryId: input.menuCategoryId,
        nameUz: input.nameUz,
        nameRu: input.nameRu,
        nameEn: input.nameEn,
        descriptionUz: input.descriptionUz,
        descriptionRu: input.descriptionRu,
        descriptionEn: input.descriptionEn,
        basePrice: input.basePrice,
        discountedPrice: input.discountedPrice,
        isAvailable: input.isAvailable,
        sortOrder: input.sortOrder,
        searchText: buildProductSearchText(mergedForSearch),
      },
      include: {
        images: true,
        variants: true,
        modifierGroups: { include: { options: true } },
      },
    });
  });
}

export async function deleteProduct(restaurantId: string, productId: string) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, restaurantId, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound("Product not found");
  }
  await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date(), isAvailable: false },
  });
}

export async function addProductImage(
  restaurantId: string,
  productId: string,
  input: AddProductImageInput,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, restaurantId, deletedAt: null },
  });
  if (!product) {
    throw ApiError.notFound("Product not found");
  }
  return prisma.productImage.create({
    data: {
      productId,
      url: input.url,
      width: input.width ?? null,
      height: input.height ?? null,
      sortOrder: input.sortOrder,
    },
  });
}

export async function deleteProductImage(restaurantId: string, productId: string, imageId: string) {
  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId, product: { restaurantId } },
  });
  if (!image) {
    throw ApiError.notFound("Product image not found");
  }
  await prisma.productImage.delete({ where: { id: imageId } });
}
