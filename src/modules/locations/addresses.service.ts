import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { AddressInput } from "@/modules/locations/schemas";

/**
 * Address CRUD, always scoped to the requesting user — there is no
 * "fetch any address by id" path here, which is the primary IDOR defense
 * for this resource (every query filters by userId in addition to id).
 */

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

export async function listAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId, deletedAt: null },
    include: { region: true, city: true, district: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function getAddress(userId: string, addressId: string) {
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
    include: { region: true, city: true, district: true },
  });
  if (!address) {
    throw ApiError.notFound("Address not found");
  }
  return address;
}

export async function createAddress(userId: string, input: AddressInput) {
  await assertLocationHierarchyValid(input);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({
        where: { userId, deletedAt: null },
        data: { isDefault: false },
      });
    }

    // If this is the user's very first address, make it the default
    // regardless of what was requested, so there's never a state with
    // saved addresses but no default.
    const existingCount = await tx.address.count({ where: { userId, deletedAt: null } });

    return tx.address.create({
      data: {
        userId,
        label: input.label ?? null,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        regionId: input.regionId,
        cityId: input.cityId,
        districtId: input.districtId ?? null,
        addressLine: input.addressLine,
        street: input.street ?? null,
        building: input.building ?? null,
        apartment: input.apartment ?? null,
        entrance: input.entrance ?? null,
        floor: input.floor ?? null,
        deliveryInstructions: input.deliveryInstructions ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        isDefault: input.isDefault || existingCount === 0,
      },
      include: { region: true, city: true, district: true },
    });
  });
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: Partial<AddressInput>,
) {
  const existing = await prisma.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound("Address not found");
  }

  const regionId = input.regionId ?? existing.regionId;
  const cityId = input.cityId ?? existing.cityId;
  const districtId = input.districtId !== undefined ? input.districtId : existing.districtId;
  await assertLocationHierarchyValid({ regionId, cityId, districtId });

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({
        where: { userId, deletedAt: null, id: { not: addressId } },
        data: { isDefault: false },
      });
    }

    return tx.address.update({
      where: { id: addressId },
      data: {
        label: input.label,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        regionId: input.regionId,
        cityId: input.cityId,
        districtId: input.districtId,
        addressLine: input.addressLine,
        street: input.street,
        building: input.building,
        apartment: input.apartment,
        entrance: input.entrance,
        floor: input.floor,
        deliveryInstructions: input.deliveryInstructions,
        latitude: input.latitude,
        longitude: input.longitude,
        isDefault: input.isDefault,
      },
      include: { region: true, city: true, district: true },
    });
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  const existing = await prisma.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
  });
  if (!existing) {
    throw ApiError.notFound("Address not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.update({
      where: { id: addressId },
      data: { deletedAt: new Date(), isDefault: false },
    });

    // If the deleted address was the default, promote the most recently
    // created remaining address to default so the user is never left
    // without one while they still have saved addresses.
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });
}
