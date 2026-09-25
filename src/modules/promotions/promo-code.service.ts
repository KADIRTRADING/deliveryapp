import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

export interface PromoCodeValidationResult {
  promoCodeId: string;
  discountAmount: number;
}

/**
 * Validate a promo code against a specific order-in-progress and compute
 * the real discount amount server-side — per "Validate server-side" (the
 * promotions requirement) and the platform-wide rule that no monetary
 * value is ever trusted from the client. This is called from
 * checkout.service.ts before the order total is finalized.
 *
 * Enforced rules, matching the spec's promo code feature list exactly:
 * - active + within [startsAt, endsAt]
 * - restaurant-scoped codes only apply to that restaurant (null = platform-wide)
 * - minOrderAmount
 * - maxDiscountAmount cap (for percentage discounts)
 * - usageLimit (total redemptions across all users)
 * - perUserLimit (redemptions by this specific user)
 * - FREE_DELIVERY codes are validated here but applied to the delivery fee
 *   by the caller (checkout.service.ts), not folded into discountAmount,
 *   since they discount a different line than the food subtotal.
 */
export async function validatePromoCode(
  code: string,
  userId: string,
  restaurantId: string,
  subtotalAmount: number,
): Promise<PromoCodeValidationResult> {
  const promoCode = await prisma.promoCode.findUnique({ where: { code: code.toUpperCase() } });

  if (!promoCode || !promoCode.isActive) {
    throw ApiError.badRequest("This promo code is not valid.");
  }

  const now = new Date();
  if (now < promoCode.startsAt || now > promoCode.endsAt) {
    throw ApiError.badRequest("This promo code is not currently active.");
  }

  if (promoCode.restaurantId && promoCode.restaurantId !== restaurantId) {
    throw ApiError.badRequest("This promo code is not valid at this restaurant.");
  }

  if (subtotalAmount < promoCode.minOrderAmount) {
    throw ApiError.badRequest(
      `This promo code requires a minimum order of ${promoCode.minOrderAmount} UZS.`,
    );
  }

  if (promoCode.usageLimit !== null && promoCode.usedCount >= promoCode.usageLimit) {
    throw ApiError.badRequest("This promo code has reached its usage limit.");
  }

  const userRedemptionCount = await prisma.promoCodeRedemption.count({
    where: { promoCodeId: promoCode.id, userId },
  });
  if (userRedemptionCount >= promoCode.perUserLimit) {
    throw ApiError.badRequest("You have already used this promo code the maximum number of times.");
  }

  let discountAmount = 0;
  if (promoCode.discountType === "PERCENTAGE") {
    discountAmount = Math.round((subtotalAmount * promoCode.discountValue) / 100);
  } else if (promoCode.discountType === "FIXED") {
    discountAmount = promoCode.discountValue;
  }
  // FREE_DELIVERY: discountAmount on the subtotal stays 0; the caller
  // applies free delivery to the delivery fee line separately.

  if (promoCode.maxDiscountAmount !== null) {
    discountAmount = Math.min(discountAmount, promoCode.maxDiscountAmount);
  }
  discountAmount = Math.min(discountAmount, subtotalAmount);

  return { promoCodeId: promoCode.id, discountAmount };
}

/**
 * Record a promo code's redemption against a newly created order. Must be
 * called inside the same database transaction as order creation — a promo
 * code's usedCount and per-user redemption record must never drift out of
 * sync with whether an order actually using it exists.
 */
export async function redeemPromoCode(
  tx: Prisma.TransactionClient,
  promoCodeId: string,
  userId: string,
  orderId: string,
  discountAmount: number,
): Promise<void> {
  await tx.promoCodeRedemption.create({
    data: { promoCodeId, userId, orderId, discountAmount },
  });
  await tx.promoCode.update({
    where: { id: promoCodeId },
    data: { usedCount: { increment: 1 } },
  });
}

export function isFreeDeliveryCode(discountType: string): boolean {
  return discountType === "FREE_DELIVERY";
}
