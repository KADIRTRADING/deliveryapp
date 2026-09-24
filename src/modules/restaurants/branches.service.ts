import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { CreateBranchInput, UpdateBranchInput } from "@/modules/restaurants/schemas";

async function assertLocationHierarchyValid(input: {
  regionId: string;
  cityId: string;
  districtId?: string | null;
}) {
  const city = await prisma.city.findUnique({ where: { id: input.cityId } });
  if (!city || city.regionId !== input.regionId) {
    throw ApiError.badRequest("The selected city does not belong to the selected region.");
  }
  if (input.districtId) {
    const district = await prisma.district.findUnique({ where: { id: input.districtId } });
    if (!district || district.cityId !== input.cityId) {
      throw ApiError.badRequest("The selected district does not belong to the selected city.");
    }
  }
}

export async function listBranches(restaurantId: string) {
  return prisma.restaurantBranch.findMany({
    where: { restaurantId, deletedAt: null },
    include: { region: true, city: true, district: true, deliveryZones: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createBranch(restaurantId: string, input: CreateBranchInput) {
  await assertLocationHierarchyValid(input);

  return prisma.restaurantBranch.create({
    data: {
      restaurantId,
      name: input.name,
      addressLine: input.addressLine,
      regionId: input.regionId,
      cityId: input.cityId,
      districtId: input.districtId ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      phone: input.phone,
      openingHours: input.openingHours as Prisma.InputJsonValue,
    },
    include: { region: true, city: true, district: true },
  });
}

export async function updateBranch(branchId: string, input: UpdateBranchInput) {
  const existing = await prisma.restaurantBranch.findUnique({ where: { id: branchId } });
  if (!existing || existing.deletedAt) {
    throw ApiError.notFound("Branch not found");
  }

  const regionId = input.regionId ?? existing.regionId;
  const cityId = input.cityId ?? existing.cityId;
  const districtId = input.districtId !== undefined ? input.districtId : existing.districtId;
  if (input.regionId || input.cityId || input.districtId !== undefined) {
    await assertLocationHierarchyValid({ regionId, cityId, districtId });
  }

  return prisma.restaurantBranch.update({
    where: { id: branchId },
    data: {
      name: input.name,
      addressLine: input.addressLine,
      regionId: input.regionId,
      cityId: input.cityId,
      districtId: input.districtId,
      latitude: input.latitude,
      longitude: input.longitude,
      phone: input.phone,
      openingHours: input.openingHours as Prisma.InputJsonValue | undefined,
      isActive: input.isActive,
      temporarilyClosedUntil:
        input.temporarilyClosedUntil !== undefined
          ? input.temporarilyClosedUntil
            ? new Date(input.temporarilyClosedUntil)
            : null
          : undefined,
    },
    include: { region: true, city: true, district: true },
  });
}

export async function deleteBranch(branchId: string) {
  const existing = await prisma.restaurantBranch.findUnique({ where: { id: branchId } });
  if (!existing || existing.deletedAt) {
    throw ApiError.notFound("Branch not found");
  }
  await prisma.restaurantBranch.update({
    where: { id: branchId },
    data: { deletedAt: new Date(), isActive: false },
  });
}
