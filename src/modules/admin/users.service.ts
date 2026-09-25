import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { revokeAllSessionsForUser } from "@/modules/auth/session";
import type { Role, UserStatus } from "@prisma/client";

/**
 * Admin user management. Per "manage categories, users, couriers and
 * restaurant accounts" — list/filter users, suspend/reactivate accounts,
 * and grant/revoke individual roles. Password hashes are never selected
 * here (matches the toPublicUser() discipline established in
 * src/modules/auth/dto.ts) — admin tooling has no legitimate need to ever
 * see a hash, and excluding the field by construction removes an entire
 * class of accidental-leak bugs.
 */

const adminUserSelect = {
  id: true,
  phone: true,
  phoneVerifiedAt: true,
  email: true,
  emailVerifiedAt: true,
  firstName: true,
  lastName: true,
  status: true,
  locale: true,
  createdAt: true,
  roles: { select: { role: true } },
} as const;

export async function listUsers(opts: {
  role?: Role;
  status?: UserStatus;
  q?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    deletedAt: null,
    ...(opts.role ? { roles: { some: { role: opts.role } } } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q
      ? {
          OR: [
            { phone: { contains: opts.q } },
            { firstName: { contains: opts.q, mode: "insensitive" as const } },
            { lastName: { contains: opts.q, mode: "insensitive" as const } },
            { email: { contains: opts.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getUserForAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!user || user.status === "DELETED") {
    throw ApiError.notFound("User not found");
  }
  return user;
}

/**
 * Suspend or reactivate a user. Suspension immediately revokes every active
 * session — a suspended account must not remain usable through a
 * still-valid cookie until it happens to expire.
 */
export async function updateUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status === "DELETED") {
    throw ApiError.notFound("User not found");
  }

  await prisma.user.update({ where: { id: userId }, data: { status } });

  if (status === "SUSPENDED") {
    await revokeAllSessionsForUser(userId);
  }

  return getUserForAdmin(userId);
}

export async function modifyUserRole(userId: string, role: Role, action: "GRANT" | "REVOKE") {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!user || user.status === "DELETED") {
    throw ApiError.notFound("User not found");
  }

  if (action === "GRANT") {
    const existing = user.roles.some((r) => r.role === role);
    if (!existing) {
      await prisma.userRoleAssignment.create({ data: { userId, role } });
    }
  } else {
    if (user.roles.length <= 1 && user.roles.some((r) => r.role === role)) {
      throw ApiError.badRequest("Cannot revoke a user's only remaining role.");
    }
    await prisma.userRoleAssignment.deleteMany({ where: { userId, role } });
    // Revoking a role changes what the user is authorized to do; force
    // re-authentication so any cached session reflects the new role set
    // immediately rather than at next natural expiry.
    await revokeAllSessionsForUser(userId);
  }

  return getUserForAdmin(userId);
}
