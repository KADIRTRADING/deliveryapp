import { z } from "zod";

export const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  modifierOptionIds: z.array(z.string().uuid()).default([]),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(50).optional(),
  variantId: z.string().uuid().nullable().optional(),
  modifierOptionIds: z.array(z.string().uuid()).optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const updateCartNotesSchema = z.object({
  notes: z.string().trim().max(500).nullable(),
});
