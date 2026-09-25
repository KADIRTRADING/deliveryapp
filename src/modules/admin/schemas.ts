import { z } from "zod";

export const listUsersQuerySchema = z.object({
  role: z
    .enum([
      "CUSTOMER",
      "RESTAURANT_OWNER",
      "RESTAURANT_STAFF",
      "COURIER",
      "SUPPORT",
      "ADMIN",
      "SUPER_ADMIN",
    ])
    .optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
  q: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Grant/revoke a single role. Deliberately narrow (one role at a time,
 * explicit grant/revoke action) rather than "replace the whole role set" —
 * this keeps every privilege change individually auditable and prevents a
 * single malformed request from silently stripping an admin's own access.
 */
export const modifyUserRoleSchema = z.object({
  role: z.enum([
    "CUSTOMER",
    "RESTAURANT_OWNER",
    "RESTAURANT_STAFF",
    "COURIER",
    "SUPPORT",
    "ADMIN",
    "SUPER_ADMIN",
  ]),
  action: z.enum(["GRANT", "REVOKE"]),
});

export const createCourierSchema = z.object({
  userId: z.string().uuid(),
  vehicleType: z.string().trim().min(1).max(50),
  licensePlate: z.string().trim().max(20).nullable().optional(),
});

export const updateCourierStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const updateCommissionSchema = z.object({
  commissionBps: z.coerce.number().int().min(0).max(10_000),
});

export const createRegionSchema = z.object({
  code: z.string().trim().min(1).max(20),
  nameUz: z.string().trim().min(1).max(150),
  nameRu: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().min(1).max(150),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const createCitySchema = z.object({
  regionId: z.string().uuid(),
  code: z.string().trim().min(1).max(30),
  nameUz: z.string().trim().min(1).max(150),
  nameRu: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().min(1).max(150),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const createDistrictSchema = z.object({
  cityId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  nameUz: z.string().trim().min(1).max(150),
  nameRu: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().min(1).max(150),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const listAdminOrdersQuerySchema = z.object({
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
  restaurantId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listAuditLogQuerySchema = z.object({
  entityType: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  actorUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const listSupportTicketsQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateSupportTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export const addSupportTicketMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
