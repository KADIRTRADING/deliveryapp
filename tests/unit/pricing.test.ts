import { describe, expect, it } from "vitest";
import { priceLine, calculateDeliveryFee, calculateOrderTotals } from "@/modules/pricing/pricing";

describe("priceLine", () => {
  it("prices a simple line with no variant or modifiers", () => {
    const result = priceLine({ basePrice: 35000, modifiers: [], quantity: 2 });
    expect(result).toEqual({
      unitBasePrice: 35000,
      unitFinalPrice: 35000,
      quantity: 2,
      lineTotal: 70000,
    });
  });

  it("uses discountedPrice when it is lower than basePrice", () => {
    const result = priceLine({
      basePrice: 35000,
      discountedPrice: 29000,
      modifiers: [],
      quantity: 1,
    });
    expect(result.unitFinalPrice).toEqual(29000);
  });

  it("ignores discountedPrice when it is not lower than basePrice", () => {
    const result = priceLine({
      basePrice: 35000,
      discountedPrice: 40000,
      modifiers: [],
      quantity: 1,
    });
    expect(result.unitFinalPrice).toEqual(35000);
  });

  it("adds the variant price delta on top of the effective base", () => {
    const result = priceLine({
      basePrice: 35000,
      variantPriceDelta: 15000,
      modifiers: [],
      quantity: 1,
    });
    expect(result.unitFinalPrice).toEqual(50000);
  });

  it("sums multiple modifier price deltas", () => {
    const result = priceLine({
      basePrice: 35000,
      modifiers: [{ priceDelta: 8000 }, { priceDelta: 5000 }],
      quantity: 1,
    });
    expect(result.unitFinalPrice).toEqual(48000);
  });

  it("combines discounted base, variant delta, and modifiers together", () => {
    const result = priceLine({
      basePrice: 35000,
      discountedPrice: 29000,
      variantPriceDelta: 15000,
      modifiers: [{ priceDelta: 8000 }],
      quantity: 3,
    });
    // 29000 + 15000 + 8000 = 52000 per unit
    expect(result.unitFinalPrice).toEqual(52000);
    expect(result.lineTotal).toEqual(156000);
  });

  it("never produces a negative unit price even with large negative modifiers", () => {
    const result = priceLine({
      basePrice: 10000,
      modifiers: [{ priceDelta: -50000 }],
      quantity: 1,
    });
    expect(result.unitFinalPrice).toEqual(0);
    expect(result.lineTotal).toEqual(0);
  });
});

describe("calculateDeliveryFee", () => {
  it("returns just the base fee at zero distance", () => {
    expect(calculateDeliveryFee({ baseFee: 12000, perKmFee: 2000, distanceMeters: 0 })).toEqual(
      12000,
    );
  });

  it("adds the per-km rate scaled by distance", () => {
    // 12000 + 2000 * 2.5km = 17000
    expect(calculateDeliveryFee({ baseFee: 12000, perKmFee: 2000, distanceMeters: 2500 })).toEqual(
      17000,
    );
  });

  it("rounds to the nearest whole UZS", () => {
    // 10000 + 1500 * 1.333 = 12000 (rounded)
    const fee = calculateDeliveryFee({ baseFee: 10000, perKmFee: 1500, distanceMeters: 1333 });
    expect(Number.isInteger(fee)).toBe(true);
  });
});

describe("calculateOrderTotals", () => {
  const lines = [{ unitBasePrice: 35000, unitFinalPrice: 35000, quantity: 2, lineTotal: 70000 }];

  it("sums subtotal from lines and adds delivery + service fees", () => {
    const totals = calculateOrderTotals({
      lines,
      deliveryFeeAmount: 12000,
      serviceFeeAmount: 0,
      discountAmount: 0,
      commissionBps: 1500,
    });
    expect(totals.subtotalAmount).toEqual(70000);
    expect(totals.totalAmount).toEqual(82000);
  });

  it("applies a discount before computing the total, capped at the subtotal", () => {
    const totals = calculateOrderTotals({
      lines,
      deliveryFeeAmount: 12000,
      serviceFeeAmount: 0,
      discountAmount: 100000, // larger than the subtotal
      commissionBps: 1500,
    });
    expect(totals.discountAmount).toEqual(70000); // capped
    expect(totals.totalAmount).toEqual(12000); // subtotal fully discounted, only delivery remains
  });

  it("computes platform commission against the post-discount subtotal only, never the delivery fee", () => {
    const totals = calculateOrderTotals({
      lines,
      deliveryFeeAmount: 12000,
      serviceFeeAmount: 0,
      discountAmount: 0,
      commissionBps: 1500, // 15%
    });
    // 70000 * 15% = 10500
    expect(totals.platformCommissionAmount).toEqual(10500);
    expect(totals.restaurantEarningsAmount).toEqual(59500);
    // Commission must never be computed against delivery fee.
    expect(totals.platformCommissionAmount).toBeLessThan(
      totals.deliveryFeeAmount + totals.subtotalAmount,
    );
  });

  it("never produces a negative total even if fees are zero and discount equals subtotal", () => {
    const totals = calculateOrderTotals({
      lines,
      deliveryFeeAmount: 0,
      serviceFeeAmount: 0,
      discountAmount: 70000,
      commissionBps: 1500,
    });
    expect(totals.totalAmount).toEqual(0);
  });
});
