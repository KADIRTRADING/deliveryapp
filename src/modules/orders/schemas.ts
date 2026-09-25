import { z } from "zod";

export const checkoutSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum(["CASH", "ONLINE"]),
  /** Optional overrides for who actually receives the order at the door. */
  recipientName: z.string().trim().min(1).max(150).optional(),
  recipientPhone: z
    .string()
    .trim()
    .regex(/^\+998\d{9}$/, "Phone number must be in the format +998XXXXXXXXX")
    .optional(),
  deliveryInstructions: z.string().trim().max(500).nullable().optional(),
  /** Optional promo code — full validation/redemption lands in Phase 7. */
  promoCode: z.string().trim().toUpperCase().max(50).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
