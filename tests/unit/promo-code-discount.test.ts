import { describe, expect, it } from "vitest";
import { calculatePromoDiscount } from "@/modules/promotions/promo-code.service";

describe("calculatePromoDiscount", () => {
  it("computes a percentage discount rounded to the nearest whole UZS", () => {
    const discount = calculatePromoDiscount({
      discountType: "PERCENTAGE",
      discountValue: 15,
      maxDiscountAmount: null,
      subtotalAmount: 100000,
    });
    expect(discount).toEqual(15000);
  });

  it("returns the fixed discount value directly for FIXED codes", () => {
    const discount = calculatePromoDiscount({
      discountType: "FIXED",
      discountValue: 20000,
      maxDiscountAmount: null,
      subtotalAmount: 100000,
    });
    expect(discount).toEqual(20000);
  });

  it("returns 0 for FREE_DELIVERY codes (handled separately by the caller)", () => {
    const discount = calculatePromoDiscount({
      discountType: "FREE_DELIVERY",
      discountValue: 0,
      maxDiscountAmount: null,
      subtotalAmount: 100000,
    });
    expect(discount).toEqual(0);
  });

  it("caps a percentage discount at maxDiscountAmount", () => {
    const discount = calculatePromoDiscount({
      discountType: "PERCENTAGE",
      discountValue: 50,
      maxDiscountAmount: 10000,
      subtotalAmount: 100000,
    });
    // 50% of 100000 = 50000, capped at 10000.
    expect(discount).toEqual(10000);
  });

  it("caps a fixed discount at the subtotal so a discount can never exceed the order total", () => {
    const discount = calculatePromoDiscount({
      discountType: "FIXED",
      discountValue: 500000,
      maxDiscountAmount: null,
      subtotalAmount: 30000,
    });
    expect(discount).toEqual(30000);
  });

  it("applies the smaller of maxDiscountAmount and subtotal when both would cap the discount", () => {
    const discount = calculatePromoDiscount({
      discountType: "FIXED",
      discountValue: 1000000,
      maxDiscountAmount: 50000,
      subtotalAmount: 30000,
    });
    expect(discount).toEqual(30000);
  });
});
