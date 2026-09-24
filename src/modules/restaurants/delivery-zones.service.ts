import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type {
  CreateDeliveryZoneInput,
  UpdateDeliveryZoneInput,
} from "@/modules/restaurants/schemas";

export async function listDeliveryZones(branchId: string) {
  return prisma.deliveryZone.findMany({
    where: { branchId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createDeliveryZone(branchId: string, input: CreateDeliveryZoneInput) {
  return prisma.deliveryZone.create({
    data: {
      branchId,
      name: input.name,
      type: input.type,
      radiusMeters: input.type === "RADIUS" ? input.radiusMeters : null,
      polygon: input.type === "POLYGON" ? (input.polygon as Prisma.InputJsonValue) : undefined,
      baseFee: input.baseFee,
      perKmFee: input.perKmFee,
      minOrderAmount: input.minOrderAmount,
      maxDeliveryDistanceMeters: input.maxDeliveryDistanceMeters ?? null,
      estimatedMinMinutes: input.estimatedMinMinutes,
      estimatedMaxMinutes: input.estimatedMaxMinutes,
    },
  });
}

export async function updateDeliveryZone(zoneId: string, input: UpdateDeliveryZoneInput) {
  const existing = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!existing) {
    throw ApiError.notFound("Delivery zone not found");
  }

  return prisma.deliveryZone.update({
    where: { id: zoneId },
    data: {
      name: input.name,
      radiusMeters: input.radiusMeters,
      polygon: input.polygon as Prisma.InputJsonValue | undefined,
      baseFee: input.baseFee,
      perKmFee: input.perKmFee,
      minOrderAmount: input.minOrderAmount,
      maxDeliveryDistanceMeters: input.maxDeliveryDistanceMeters,
      estimatedMinMinutes: input.estimatedMinMinutes,
      estimatedMaxMinutes: input.estimatedMaxMinutes,
      isActive: input.isActive,
    },
  });
}

export async function deleteDeliveryZone(zoneId: string) {
  const existing = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!existing) {
    throw ApiError.notFound("Delivery zone not found");
  }
  await prisma.deliveryZone.delete({ where: { id: zoneId } });
}
