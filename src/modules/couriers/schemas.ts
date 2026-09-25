import { z } from "zod";

export const updateOnlineStatusSchema = z.object({
  isOnline: z.boolean(),
});

export const updateCourierLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

export const respondToAssignmentSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT"]),
});

export const advanceDeliveryStatusSchema = z.object({
  status: z.enum(["PICKED_UP", "ON_THE_WAY", "DELIVERED"]),
});
