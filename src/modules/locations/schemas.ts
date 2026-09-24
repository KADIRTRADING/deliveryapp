import { z } from "zod";

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

export const listCitiesQuerySchema = z.object({
  regionId: z.string().uuid().optional(),
});

export const listDistrictsQuerySchema = z.object({
  cityId: z.string().uuid(),
});

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(2, "Query must be at least 2 characters"),
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
});

export const reverseGeocodeQuerySchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
});

export const addressInputSchema = z.object({
  label: z.string().trim().max(50).optional(),
  recipientName: z.string().trim().min(1).max(150),
  recipientPhone: z
    .string()
    .trim()
    .regex(/^\+998\d{9}$/, "Phone number must be in the format +998XXXXXXXXX"),
  regionId: z.string().uuid(),
  cityId: z.string().uuid(),
  districtId: z.string().uuid().nullable().optional(),
  addressLine: z.string().trim().min(1).max(300),
  street: z.string().trim().max(150).nullable().optional(),
  building: z.string().trim().max(50).nullable().optional(),
  apartment: z.string().trim().max(50).nullable().optional(),
  entrance: z.string().trim().max(50).nullable().optional(),
  floor: z.string().trim().max(20).nullable().optional(),
  deliveryInstructions: z.string().trim().max(500).nullable().optional(),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  isDefault: z.boolean().optional().default(false),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

export const addressUpdateSchema = addressInputSchema.partial();
