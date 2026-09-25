import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * Admin-managed courier accounts. Creating a Courier record is an
 * admin-only action — per the platform's role model, a user becomes a
 * courier by an admin provisioning their courier profile (vehicle type,
 * license plate) on top of an existing user account with the COURIER role,
 * not through self-service signup. This mirrors how RESTAURANT_OWNER
 * accounts self-service-create a Restaurant but never self-assign the role
 * itself (see auth.service.ts's registerUser, which only ever grants
 * CUSTOMER).
 */

export async function listCouriers(opts: { page: number; pageSize: number }) {
  const [items, total] = await Promise.all([
    prisma.courier.findMany({
      include: {
        user: {
          select: { id: true, phone: true, firstName: true, lastName: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.courier.count(),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function createCourier(input: {
  userId: string;
  vehicleType: string;
  licensePlate?: string | null;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { roles: true },
  });
  if (!user || user.status === "DELETED") {
    throw ApiError.notFound("User not found");
  }

  const existing = await prisma.courier.findUnique({ where: { userId: input.userId } });
  if (existing) {
    throw ApiError.conflict("This user already has a courier profile.");
  }

  return prisma.$transaction(async (tx) => {
    const hasCourierRole = user.roles.some((r) => r.role === "COURIER");
    if (!hasCourierRole) {
      await tx.userRoleAssignment.create({ data: { userId: input.userId, role: "COURIER" } });
    }

    return tx.courier.create({
      data: {
        userId: input.userId,
        vehicleType: input.vehicleType,
        licensePlate: input.licensePlate ?? null,
      },
      include: { user: { select: { id: true, phone: true, firstName: true, lastName: true } } },
    });
  });
}

export async function updateCourierStatus(courierId: string, status: "ACTIVE" | "SUSPENDED") {
  const courier = await prisma.courier.findUnique({ where: { id: courierId } });
  if (!courier) {
    throw ApiError.notFound("Courier not found");
  }
  return prisma.courier.update({
    where: { id: courierId },
    data: { status, ...(status === "SUSPENDED" ? { isOnline: false } : {}) },
  });
}
