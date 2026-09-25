import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { haversineDistanceMeters, isPointInPolygon, isWithinRadius } from "@/lib/geo";
import { priceCart } from "@/modules/cart/cart.service";
import { calculateDeliveryFee, calculateOrderTotals } from "@/modules/pricing/pricing";
import { generateOrderNumber } from "@/modules/orders/order-number";
import { validatePromoCode, redeemPromoCode } from "@/modules/promotions/promo-code.service";
import type { CheckoutInput } from "@/modules/orders/schemas";
import type { Prisma } from "@prisma/client";

/**
 * Checkout — the single most safety-critical flow in the platform.
 *
 * Hard rules enforced here, matching the spec's explicit requirements:
 * 1. "At checkout, server-side verify customer coordinates are inside a
 *    valid delivery area." — we test the address's real lat/lng against
 *    each candidate branch's real delivery zones (radius or polygon) using
 *    the same geofencing primitives as restaurant discovery/search. A
 *    client can never simply pass a branchId/zoneId and have it trusted.
 * 2. "Never trust client-supplied distance." — delivery fee distance is
 *    computed server-side via Haversine from the branch's stored
 *    coordinates to the address's stored coordinates.
 * 3. "All monetary totals MUST be recalculated and validated server-side."
 *    — every line is re-priced from live Product/Variant/ModifierOption
 *    rows via priceCart() (Phase 4's cart service), not from anything
 *    stored on the CartItem itself (which stores only IDs/quantities).
 * 4. "Use transactions where partial completion could corrupt financial/
 *    order state." — order + items + modifiers + status history + cart
 *    deletion all happen inside one Prisma transaction.
 * 5. "When an order is created, snapshot relevant product name, selected
 *    variant, modifier names, prices, quantity and restaurant/branch
 *    details." — OrderItem/OrderItemModifier store name/price snapshots;
 *    Order.addressSnapshot stores the full delivery address as JSON.
 */

interface ServiceableBranch {
  branchId: string;
  deliveryZoneId: string;
  baseFee: number;
  perKmFee: number;
  minOrderAmount: number;
  distanceMeters: number;
}

async function findServiceableBranch(
  restaurantId: string,
  point: { latitude: number; longitude: number },
): Promise<ServiceableBranch> {
  const branches = await prisma.restaurantBranch.findMany({
    where: { restaurantId, deletedAt: null, isActive: true },
    include: { deliveryZones: { where: { isActive: true } } },
  });

  for (const branch of branches) {
    for (const zone of branch.deliveryZones) {
      const distanceMeters = haversineDistanceMeters(point, {
        latitude: branch.latitude,
        longitude: branch.longitude,
      });

      let inZone = false;
      if (zone.type === "RADIUS" && zone.radiusMeters) {
        inZone = isWithinRadius(
          point,
          { latitude: branch.latitude, longitude: branch.longitude },
          zone.radiusMeters,
        );
      } else if (zone.type === "POLYGON" && Array.isArray(zone.polygon)) {
        inZone = isPointInPolygon(point, zone.polygon as Array<[number, number]>);
      }

      if (
        inZone &&
        (!zone.maxDeliveryDistanceMeters || distanceMeters <= zone.maxDeliveryDistanceMeters)
      ) {
        return {
          branchId: branch.id,
          deliveryZoneId: zone.id,
          baseFee: zone.baseFee,
          perKmFee: zone.perKmFee,
          minOrderAmount: zone.minOrderAmount,
          distanceMeters,
        };
      }
    }
  }

  throw ApiError.badRequest(
    "This delivery address is outside this restaurant's delivery area. Please choose a different address.",
  );
}

export async function checkout(userId: string, restaurantId: string, input: CheckoutInput) {
  const [cart, address, restaurant] = await Promise.all([
    prisma.cart.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
      include: {
        items: {
          include: {
            product: true,
            variant: true,
            modifiers: { include: { modifierOption: true } },
          },
        },
      },
    }),
    prisma.address.findFirst({
      where: { id: input.addressId, userId, deletedAt: null },
      include: { region: true, city: true, district: true },
    }),
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
  ]);

  if (!cart || cart.items.length === 0) {
    throw ApiError.badRequest("Your cart is empty.");
  }
  if (!address) {
    throw ApiError.badRequest("The selected delivery address was not found.");
  }
  if (!restaurant || restaurant.deletedAt || restaurant.status !== "APPROVED") {
    throw ApiError.notFound("Restaurant not found");
  }

  // Re-price every line from live data — never from anything cached on the
  // CartItem rows themselves.
  const priced = await priceCart(cart);
  if (priced.lines.length === 0) {
    throw ApiError.badRequest("Your cart is empty.");
  }

  const deliveryPoint = { latitude: address.latitude, longitude: address.longitude };
  const servicing = await findServiceableBranch(restaurantId, deliveryPoint);

  if (priced.subtotalAmount < servicing.minOrderAmount) {
    throw ApiError.badRequest(
      `This restaurant requires a minimum order of ${servicing.minOrderAmount} UZS for this address.`,
    );
  }

  let deliveryFeeAmount = calculateDeliveryFee({
    baseFee: servicing.baseFee,
    perKmFee: servicing.perKmFee,
    distanceMeters: servicing.distanceMeters,
  });

  let discountAmount = 0;
  let appliedPromoCodeId: string | null = null;

  if (input.promoCode) {
    const promoCode = await prisma.promoCode.findUnique({ where: { code: input.promoCode } });
    const validation = await validatePromoCode(
      input.promoCode,
      userId,
      restaurantId,
      priced.subtotalAmount,
    );
    appliedPromoCodeId = validation.promoCodeId;
    if (promoCode?.discountType === "FREE_DELIVERY") {
      deliveryFeeAmount = 0;
    } else {
      discountAmount = validation.discountAmount;
    }
  }

  const totals = calculateOrderTotals({
    lines: priced.lines,
    deliveryFeeAmount,
    serviceFeeAmount: 0,
    discountAmount,
    commissionBps: restaurant.commissionBps,
  });

  const addressSnapshot = {
    label: address.label,
    recipientName: input.recipientName ?? address.recipientName,
    recipientPhone: input.recipientPhone ?? address.recipientPhone,
    addressLine: address.addressLine,
    street: address.street,
    building: address.building,
    apartment: address.apartment,
    entrance: address.entrance,
    floor: address.floor,
    region: address.region.nameEn,
    city: address.city.nameEn,
    district: address.district?.nameEn ?? null,
    latitude: address.latitude,
    longitude: address.longitude,
  } satisfies Prisma.InputJsonValue;

  const order = await prisma.$transaction(async (tx) => {
    let orderNumber = generateOrderNumber();
    // Extremely unlikely collision guard: regenerate once if the unique
    // constraint would otherwise be hit, rather than letting the whole
    // checkout fail on a one-in-a-million coincidence.
    const collision = await tx.order.findUnique({ where: { orderNumber } });
    if (collision) {
      orderNumber = generateOrderNumber();
    }

    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        userId,
        restaurantId,
        branchId: servicing.branchId,
        deliveryZoneId: servicing.deliveryZoneId,
        addressId: address.id,
        promoCodeId: appliedPromoCodeId,
        addressSnapshot,
        recipientName: input.recipientName ?? address.recipientName,
        recipientPhone: input.recipientPhone ?? address.recipientPhone,
        deliveryInstructions: input.deliveryInstructions ?? address.deliveryInstructions,
        latitude: address.latitude,
        longitude: address.longitude,
        subtotalAmount: totals.subtotalAmount,
        discountAmount: totals.discountAmount,
        deliveryFeeAmount: totals.deliveryFeeAmount,
        serviceFeeAmount: totals.serviceFeeAmount,
        totalAmount: totals.totalAmount,
        restaurantEarningsAmount: totals.restaurantEarningsAmount,
        platformCommissionAmount: totals.platformCommissionAmount,
        paymentMethod: input.paymentMethod,
        status: input.paymentMethod === "ONLINE" ? "PAYMENT_PENDING" : "PENDING",
      },
    });

    for (const line of priced.lines) {
      const cartItem = cart.items.find((i) => i.id === line.cartItemId);
      if (!cartItem) continue;

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: createdOrder.id,
          productId: line.productId,
          variantId: line.variantId,
          productNameSnapshot: line.productName,
          variantNameSnapshot: line.variantName,
          unitBasePrice: line.unitBasePrice,
          unitFinalPrice: line.unitFinalPrice,
          quantity: line.quantity,
          notes: cartItem.notes,
          lineTotal: line.lineTotal,
        },
      });

      for (const modifierId of line.modifierOptionIds) {
        const cartModifier = cartItem.modifiers.find((m) => m.modifierOptionId === modifierId);
        if (!cartModifier) continue;
        await tx.orderItemModifier.create({
          data: {
            orderItemId: orderItem.id,
            modifierOptionId: modifierId,
            modifierOptionNameSnapshot: cartModifier.modifierOption.nameEn,
            priceDelta: cartModifier.modifierOption.priceDelta,
          },
        });
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: createdOrder.id,
        status: createdOrder.status,
        actorUserId: userId,
        actorRole: "CUSTOMER",
        reason: "Order placed",
      },
    });

    if (appliedPromoCodeId) {
      await redeemPromoCode(tx, appliedPromoCodeId, userId, createdOrder.id, totals.discountAmount);
    }

    // The cart is fully consumed on successful checkout.
    await tx.cart.delete({ where: { id: cart.id } });

    return createdOrder;
  });

  return order;
}
