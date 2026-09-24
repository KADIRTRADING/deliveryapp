import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdmin, type AuthSession } from "@/modules/auth/rbac";
import type { RestaurantUserRole } from "@prisma/client";

/**
 * Restaurant-scoped authorization. Per the platform requirement "Restaurant
 * users may access only authorized restaurants/branches", every restaurant
 * dashboard/management endpoint must call one of these helpers — never rely
 * on the client only requesting resources it's "supposed to" see.
 *
 * ADMIN and SUPER_ADMIN always pass (they manage the whole platform), which
 * mirrors the "Admin can create, approve, suspend, edit and archive
 * restaurants" requirement.
 */

export async function requireRestaurantAccess(
  session: AuthSession,
  restaurantId: string,
  opts?: { roles?: RestaurantUserRole[]; branchId?: string },
): Promise<void> {
  if (isAdmin(session)) return;

  const membership = await prisma.restaurantUser.findFirst({
    where: {
      restaurantId,
      userId: session.user.id,
      ...(opts?.roles ? { role: { in: opts.roles } } : {}),
      // A null branchId on the membership row means "all branches" — so a
      // membership scoped to a specific branch only satisfies a request for
      // that same branch (or for no particular branch).
      ...(opts?.branchId ? { OR: [{ branchId: opts.branchId }, { branchId: null }] } : {}),
    },
  });

  if (!membership) {
    throw ApiError.forbidden("You do not have access to this restaurant.");
  }
}

export async function requireDeliveryZoneAccess(
  session: AuthSession,
  zoneId: string,
  opts?: { roles?: RestaurantUserRole[] },
): Promise<{ branchId: string; restaurantId: string }> {
  const zone = await prisma.deliveryZone.findUnique({
    where: { id: zoneId },
    select: { id: true, branchId: true },
  });
  if (!zone) {
    throw ApiError.notFound("Delivery zone not found");
  }

  const { restaurantId } = await requireBranchAccess(session, zone.branchId, opts);
  return { branchId: zone.branchId, restaurantId };
}

export async function requireMenuCategoryAccess(
  session: AuthSession,
  menuCategoryId: string,
  opts?: { roles?: RestaurantUserRole[] },
): Promise<{ restaurantId: string }> {
  const category = await prisma.menuCategory.findUnique({
    where: { id: menuCategoryId },
    select: { id: true, restaurantId: true },
  });
  if (!category) {
    throw ApiError.notFound("Menu category not found");
  }
  await requireRestaurantAccess(session, category.restaurantId, { roles: opts?.roles });
  return { restaurantId: category.restaurantId };
}

export async function requireProductAccess(
  session: AuthSession,
  productId: string,
  opts?: { roles?: RestaurantUserRole[] },
): Promise<{ restaurantId: string }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, restaurantId: true },
  });
  if (!product) {
    throw ApiError.notFound("Product not found");
  }
  await requireRestaurantAccess(session, product.restaurantId, { roles: opts?.roles });
  return { restaurantId: product.restaurantId };
}

export async function requireBranchAccess(
  session: AuthSession,
  branchId: string,
  opts?: { roles?: RestaurantUserRole[] },
): Promise<{ restaurantId: string }> {
  const branch = await prisma.restaurantBranch.findUnique({
    where: { id: branchId },
    select: { id: true, restaurantId: true },
  });
  if (!branch) {
    throw ApiError.notFound("Branch not found");
  }

  await requireRestaurantAccess(session, branch.restaurantId, {
    roles: opts?.roles,
    branchId,
  });

  return { restaurantId: branch.restaurantId };
}
