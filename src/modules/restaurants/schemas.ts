import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

export const createRestaurantSchema = z.object({
  slug: slugSchema,
  nameUz: z.string().trim().min(1).max(150),
  nameRu: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().min(1).max(150),
  descriptionUz: z.string().trim().max(2000).nullable().optional(),
  descriptionRu: z.string().trim().max(2000).nullable().optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  categoryIds: z.array(z.string().uuid()).default([]),
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;

export const updateRestaurantSchema = z.object({
  nameUz: z.string().trim().min(1).max(150).optional(),
  nameRu: z.string().trim().min(1).max(150).optional(),
  nameEn: z.string().trim().min(1).max(150).optional(),
  descriptionUz: z.string().trim().max(2000).nullable().optional(),
  descriptionRu: z.string().trim().max(2000).nullable().optional(),
  descriptionEn: z.string().trim().max(2000).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
});
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;

/** Admin-only: moving a restaurant through its moderation lifecycle. */
export const updateRestaurantStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "SUSPENDED", "ARCHIVED"]),
  reason: z.string().trim().max(500).optional(),
});

const dayScheduleSchema = z.array(z.tuple([z.string(), z.string()])).default([]);
export const openingHoursSchema = z.object({
  mon: dayScheduleSchema,
  tue: dayScheduleSchema,
  wed: dayScheduleSchema,
  thu: dayScheduleSchema,
  fri: dayScheduleSchema,
  sat: dayScheduleSchema,
  sun: dayScheduleSchema,
});
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(150),
  addressLine: z.string().trim().min(1).max(300),
  regionId: z.string().uuid(),
  cityId: z.string().uuid(),
  districtId: z.string().uuid().nullable().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  phone: z
    .string()
    .trim()
    .regex(/^\+998\d{9}$/, "Phone number must be in the format +998XXXXXXXXX"),
  openingHours: openingHoursSchema,
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
  temporarilyClosedUntil: z.string().datetime().nullable().optional(),
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

const polygonSchema = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .min(3, "A polygon zone requires at least 3 points");

export const createDeliveryZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    type: z.enum(["RADIUS", "POLYGON"]),
    radiusMeters: z.coerce.number().int().positive().max(50_000).optional(),
    polygon: polygonSchema.optional(),
    baseFee: z.coerce.number().int().min(0),
    perKmFee: z.coerce.number().int().min(0).default(0),
    minOrderAmount: z.coerce.number().int().min(0).default(0),
    maxDeliveryDistanceMeters: z.coerce.number().int().positive().optional(),
    estimatedMinMinutes: z.coerce.number().int().min(1).default(20),
    estimatedMaxMinutes: z.coerce.number().int().min(1).default(45),
  })
  .superRefine((data, ctx) => {
    if (data.type === "RADIUS" && !data.radiusMeters) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "radiusMeters is required for RADIUS zones",
        path: ["radiusMeters"],
      });
    }
    if (data.type === "POLYGON" && !data.polygon) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "polygon is required for POLYGON zones",
        path: ["polygon"],
      });
    }
    if (data.estimatedMaxMinutes < data.estimatedMinMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "estimatedMaxMinutes must be >= estimatedMinMinutes",
        path: ["estimatedMaxMinutes"],
      });
    }
  });
export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;

export const updateDeliveryZoneSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  radiusMeters: z.coerce.number().int().positive().max(50_000).optional(),
  polygon: polygonSchema.optional(),
  baseFee: z.coerce.number().int().min(0).optional(),
  perKmFee: z.coerce.number().int().min(0).optional(),
  minOrderAmount: z.coerce.number().int().min(0).optional(),
  maxDeliveryDistanceMeters: z.coerce.number().int().positive().nullable().optional(),
  estimatedMinMinutes: z.coerce.number().int().min(1).optional(),
  estimatedMaxMinutes: z.coerce.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;

export const createCategorySchema = z.object({
  slug: slugSchema,
  nameUz: z.string().trim().min(1).max(100),
  nameRu: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  iconUrl: z.string().url().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const restaurantListQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  cityId: z.string().uuid().optional(),
  categorySlug: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
