import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * Admin-only mutation side of the Uzbekistan location hierarchy — the read
 * side (list regions/cities/districts) is public and lives in
 * src/modules/locations/locations.service.ts (Phase 2). Creating new
 * administrative units is rare (Uzbekistan's region/city/district
 * boundaries do not change often) and platform-wide reference data, so it
 * is admin-gated rather than exposed to restaurant owners.
 */

export async function createRegion(input: {
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  latitude?: number;
  longitude?: number;
}) {
  const existing = await prisma.region.findUnique({ where: { code: input.code } });
  if (existing) {
    throw ApiError.conflict("A region with this code already exists.");
  }
  return prisma.region.create({
    data: {
      code: input.code,
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
}

export async function createCity(input: {
  regionId: string;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  latitude?: number;
  longitude?: number;
}) {
  const region = await prisma.region.findUnique({ where: { id: input.regionId } });
  if (!region) {
    throw ApiError.badRequest("The selected region does not exist.");
  }
  const existing = await prisma.city.findUnique({ where: { code: input.code } });
  if (existing) {
    throw ApiError.conflict("A city with this code already exists.");
  }
  return prisma.city.create({
    data: {
      regionId: input.regionId,
      code: input.code,
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
}

export async function createDistrict(input: {
  cityId: string;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  latitude?: number;
  longitude?: number;
}) {
  const city = await prisma.city.findUnique({ where: { id: input.cityId } });
  if (!city) {
    throw ApiError.badRequest("The selected city does not exist.");
  }
  const existing = await prisma.district.findUnique({ where: { code: input.code } });
  if (existing) {
    throw ApiError.conflict("A district with this code already exists.");
  }
  return prisma.district.create({
    data: {
      cityId: input.cityId,
      code: input.code,
      nameUz: input.nameUz,
      nameRu: input.nameRu,
      nameEn: input.nameEn,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
}
