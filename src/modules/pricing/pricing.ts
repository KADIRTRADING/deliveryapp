/**
 * Server-authoritative pricing engine.
 *
 * Per "All monetary totals MUST be recalculated and validated server-side.
 * Never trust frontend totals. Use integer monetary values": every function
 * here is a pure function operating on plain numbers/objects fetched fresh
 * from the database at calculation time — never on a client-supplied price.
 * This module has zero I/O so it is fully unit-testable without a database.
 */

export interface PricedModifier {
  priceDelta: number;
}

export interface PricedLineInput {
  /** Live basePrice from the Product row, in whole UZS. */
  basePrice: number;
  /** Live discountedPrice from the Product row, if any — used instead of basePrice when lower. */
  discountedPrice?: number | null;
  /** Live priceDelta from the selected ProductVariant row, if any. */
  variantPriceDelta?: number;
  /** Live priceDelta values from the selected ModifierOption rows. */
  modifiers: PricedModifier[];
  quantity: number;
}

export interface PricedLine {
  unitBasePrice: number;
  unitFinalPrice: number;
  quantity: number;
  lineTotal: number;
}

/**
 * Price a single cart/order line from scratch. The "effective base" is the
 * product's discountedPrice when one is set and lower than basePrice
 * (a product-level promotional price), otherwise basePrice — variant and
 * modifier deltas are then applied on top of that effective base.
 */
export function priceLine(input: PricedLineInput): PricedLine {
  const effectiveBase =
    input.discountedPrice != null && input.discountedPrice < input.basePrice
      ? input.discountedPrice
      : input.basePrice;

  const modifiersTotal = input.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  const unitFinalPrice = Math.max(
    0,
    effectiveBase + (input.variantPriceDelta ?? 0) + modifiersTotal,
  );

  return {
    unitBasePrice: input.basePrice,
    unitFinalPrice,
    quantity: input.quantity,
    lineTotal: unitFinalPrice * input.quantity,
  };
}

export interface DeliveryFeeInput {
  baseFee: number;
  perKmFee: number;
  distanceMeters: number;
}

/** Distance-based delivery fee: base + per-km rate * distance, rounded to whole UZS. */
export function calculateDeliveryFee(input: DeliveryFeeInput): number {
  const distanceKm = input.distanceMeters / 1000;
  return Math.round(input.baseFee + input.perKmFee * distanceKm);
}

export interface OrderTotalsInput {
  lines: PricedLine[];
  deliveryFeeAmount: number;
  serviceFeeAmount: number;
  discountAmount: number;
  /** Restaurant's commission rate in basis points (e.g. 1500 = 15.00%). */
  commissionBps: number;
}

export interface OrderTotals {
  subtotalAmount: number;
  discountAmount: number;
  deliveryFeeAmount: number;
  serviceFeeAmount: number;
  totalAmount: number;
  platformCommissionAmount: number;
  restaurantEarningsAmount: number;
}

/**
 * Aggregate priced lines into full order totals. The platform commission is
 * charged against the food subtotal only (never against the delivery fee,
 * which is a pass-through delivery cost, not restaurant revenue) — matching
 * how `Restaurant.commissionBps` is documented in schema.prisma.
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotalAmount = input.lines.reduce((sum, l) => sum + l.lineTotal, 0);

  const cappedDiscount = Math.min(input.discountAmount, subtotalAmount);
  const totalAmount = Math.max(
    0,
    subtotalAmount - cappedDiscount + input.deliveryFeeAmount + input.serviceFeeAmount,
  );

  const discountedSubtotal = subtotalAmount - cappedDiscount;
  const platformCommissionAmount = Math.round((discountedSubtotal * input.commissionBps) / 10_000);
  const restaurantEarningsAmount = discountedSubtotal - platformCommissionAmount;

  return {
    subtotalAmount,
    discountAmount: cappedDiscount,
    deliveryFeeAmount: input.deliveryFeeAmount,
    serviceFeeAmount: input.serviceFeeAmount,
    totalAmount,
    platformCommissionAmount,
    restaurantEarningsAmount,
  };
}
