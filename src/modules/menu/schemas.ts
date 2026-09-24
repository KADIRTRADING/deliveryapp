import { z } from "zod";

export const createMenuCategorySchema = z.object({
  nameUz: z.string().trim().min(1).max(100),
  nameRu: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;

export const updateMenuCategorySchema = createMenuCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;

const priceSchema = z.coerce.number().int().min(0).max(1_000_000_000);

export const productVariantInputSchema = z.object({
  id: z.string().uuid().optional(),
  nameUz: z.string().trim().min(1).max(100),
  nameRu: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  priceDelta: z.coerce.number().int().min(-1_000_000_000).max(1_000_000_000).default(0),
  isDefault: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

export const modifierOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  nameUz: z.string().trim().min(1).max(100),
  nameRu: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  priceDelta: z.coerce.number().int().min(-1_000_000_000).max(1_000_000_000).default(0),
  isAvailable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
export type ModifierOptionInput = z.infer<typeof modifierOptionInputSchema>;

export const modifierGroupInputSchema = z.object({
  id: z.string().uuid().optional(),
  nameUz: z.string().trim().min(1).max(100),
  nameRu: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  minSelect: z.coerce.number().int().min(0).default(0),
  maxSelect: z.coerce.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
  options: z.array(modifierOptionInputSchema).default([]),
});
export type ModifierGroupInput = z.infer<typeof modifierGroupInputSchema>;

const productBaseSchema = z.object({
  menuCategoryId: z.string().uuid(),
  nameUz: z.string().trim().min(1).max(200),
  nameRu: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().min(1).max(200),
  descriptionUz: z.string().trim().max(2000).nullable().optional(),
  descriptionRu: z.string().trim().max(2000).nullable().optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  basePrice: priceSchema,
  discountedPrice: priceSchema.nullable().optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
  variants: z.array(productVariantInputSchema).default([]),
  modifierGroups: z.array(modifierGroupInputSchema).default([]),
});

function refineDiscountedPrice<T extends { basePrice?: number; discountedPrice?: number | null }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (
    data.discountedPrice !== null &&
    data.discountedPrice !== undefined &&
    data.basePrice !== undefined &&
    data.discountedPrice >= data.basePrice
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "discountedPrice must be lower than basePrice",
      path: ["discountedPrice"],
    });
  }
}

export const createProductSchema = productBaseSchema.superRefine(refineDiscountedPrice);
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productBaseSchema.partial().superRefine(refineDiscountedPrice);
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const addProductImageSchema = z.object({
  url: z.string().url(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});
export type AddProductImageInput = z.infer<typeof addProductImageSchema>;
