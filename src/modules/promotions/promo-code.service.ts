import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

export interface PromoCodeValidationResult {
  promoCodeId: string;
  discountAmount: number;
}

export interface DiscountCalculationInput {
  discountType: "PERCENTAGE" | "FIXED" | "FREE_DELIVERY";
  discountValue: number;
  maxDiscountAmount: number | null;
  subtotalAmount: number;
}

/**
 * Pure discount-amount calculation, extracted from validatePromoCode so it
 * is unit-testable without a database (mirrors the pricing.ts pattern
 * elsewhere in this codebase: pure math lives in its own function, DB
 * lookups/validation wrap around it). FREE_DELIVERY always returns 0 here
 * — the caller (checkout.service.ts) applies free delivery to the delivery
 * fee line separately, never by folding it into this subtotal discount.
 */
export function calculatePromoDiscount(input: DiscountCalculationInput): number {
  let discountAmount = 0;
  if (input.discountType === "PERCENTAGE") {
    discountAmount = Math.round((input.subtotalAmount * input.discountValue) / 100);
  } else if (input.discountType === "FIXED") {
    discountAmount = input.discountValue;
  }

  if (input.maxDiscountAmount !== null) {
    discountAmount = Math.min(discountAmount, input.maxDiscountAmount);
  }
  return Math.min(discountAmount, input.subtotalAmount);
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

  const discountAmount = calculatePromoDiscount({
    discountType: promoCode.discountType,
    discountValue: promoCode.discountValue,
    maxDiscountAmount: promoCode.maxDiscountAmount,
    subtotalAmount,
  });

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
