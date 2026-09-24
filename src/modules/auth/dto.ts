import type { User, UserRoleAssignment } from "@prisma/client";

/**
 * Never return a Prisma User record directly from an API route — it
 * contains `passwordHash`. This is the single serialization choke point for
 * user data so a future field addition to the User model can't accidentally
 * leak through an endpoint that forgot to `select`/`omit` it.
 */
export function toPublicUser(user: User & { roles: UserRoleAssignment[] }) {
  return {
    id: user.id,
    phone: user.phone,
    phoneVerified: user.phoneVerifiedAt !== null,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    status: user.status,
    roles: user.roles.map((r) => r.role),
    createdAt: user.createdAt.toISOString(),
  };
}
