import { z } from "zod";

export const createPromoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]+$/, "Code must be uppercase letters and numbers only")
      .min(3)
      .max(30),
    description: z.string().trim().max(300).nullable().optional(),
    discountType: z.enum(["PERCENTAGE", "FIXED", "FREE_DELIVERY"]),
    discountValue: z.coerce.number().int().min(0),
    minOrderAmount: z.coerce.number().int().min(0).default(0),
    maxDiscountAmount: z.coerce.number().int().positive().nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    usageLimit: z.coerce.number().int().positive().nullable().optional(),
    perUserLimit: z.coerce.number().int().positive().default(1),
    restaurantId: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "PERCENTAGE" && data.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percentage discount cannot exceed 100.",
        path: ["discountValue"],
      });
    }
    if (new Date(data.endsAt) <= new Date(data.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endsAt must be after startsAt.",
        path: ["endsAt"],
      });
    }
  });
export type CreatePromoCodeInput = z.infer<typeof createPromoCodeSchema>;

export const updatePromoCodeSchema = z.object({
  isActive: z.boolean().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  endsAt: z.string().datetime().optional(),
});

export const createPromotionSchema = z
  .object({
    restaurantId: z.string().uuid().nullable().optional(),
    productId: z.string().uuid().nullable().optional(),
    type: z.enum(["PERCENTAGE", "FIXED", "FREE_DELIVERY"]),
    value: z.coerce.number().int().min(0),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .superRefine((data, ctx) => {
    if (!data.restaurantId && !data.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A promotion must target either a restaurant or a product.",
        path: ["restaurantId"],
      });
    }
    if (new Date(data.endsAt) <= new Date(data.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endsAt must be after startsAt.",
        path: ["endsAt"],
      });
    }
  });
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const applyPromoCodeSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(30),
});
