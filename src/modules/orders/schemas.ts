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

export const advanceOrderStatusSchema = z.object({
  status: z.enum([
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_PICKUP",
    "COURIER_ASSIGNED",
    "PICKED_UP",
    "ON_THE_WAY",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ]),
  reason: z.string().trim().max(500).optional(),
});

export const listBranchOrdersQuerySchema = z.object({
  status: z
    .enum([
      "PENDING",
      "PAYMENT_PENDING",
      "PAID",
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "COURIER_ASSIGNED",
      "PICKED_UP",
      "ON_THE_WAY",
      "DELIVERED",
      "CANCELLED",
      "REFUNDED",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
