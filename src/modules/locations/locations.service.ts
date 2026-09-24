import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * Read-only lookups over the Uzbekistan region → city → district hierarchy.
 * These back the location pickers used during address creation and
 * restaurant/branch setup. Nothing here is user-editable through this
 * service — region/city/district records are managed exclusively through
 * the admin API (Phase 6), since they are reference data shared by the
 * entire platform.
 */

export async function listRegions() {
  return prisma.region.findMany({
    orderBy: { nameUz: "asc" },
  });
}

export async function listCities(regionId?: string) {
  return prisma.city.findMany({
    where: regionId ? { regionId } : undefined,
    orderBy: { nameUz: "asc" },
  });
}

export async function listDistricts(cityId: string) {
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  if (!city) {
    throw ApiError.notFound("City not found");
  }
  return prisma.district.findMany({
    where: { cityId },
    orderBy: { nameUz: "asc" },
  });
}
