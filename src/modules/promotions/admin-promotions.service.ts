import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { CreatePromoCodeInput, CreatePromotionInput } from "@/modules/promotions/schemas";

export async function listPromoCodes() {
  return prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createPromoCode(input: CreatePromoCodeInput) {
  const existing = await prisma.promoCode.findUnique({ where: { code: input.code } });
  if (existing) {
    throw ApiError.conflict("A promo code with this code already exists.");
  }
  return prisma.promoCode.create({
    data: {
      code: input.code,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderAmount: input.minOrderAmount,
      maxDiscountAmount: input.maxDiscountAmount ?? null,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit,
      restaurantId: input.restaurantId ?? null,
    },
  });
}

export async function updatePromoCode(
  promoCodeId: string,
  input: { isActive?: boolean; description?: string | null; endsAt?: string },
) {
  const existing = await prisma.promoCode.findUnique({ where: { id: promoCodeId } });
  if (!existing) {
    throw ApiError.notFound("Promo code not found");
  }
  return prisma.promoCode.update({
    where: { id: promoCodeId },
    data: {
      isActive: input.isActive,
      description: input.description,
      endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
    },
  });
}

export async function listPromotions() {
  return prisma.promotion.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createPromotion(input: CreatePromotionInput) {
  if (input.restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: input.restaurantId } });
    if (!restaurant) {
      throw ApiError.badRequest("The selected restaurant does not exist.");
    }
  }
  if (input.productId) {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) {
      throw ApiError.badRequest("The selected product does not exist.");
    }
  }

  return prisma.promotion.create({
    data: {
      restaurantId: input.restaurantId ?? null,
      productId: input.productId ?? null,
      type: input.type,
      value: input.value,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    },
  });
}
