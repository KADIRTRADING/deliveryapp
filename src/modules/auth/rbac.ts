import "server-only";
import type { Role } from "@prisma/client";
import { ApiError } from "@/lib/api-error";
import { getCurrentSession, type AuthSession } from "@/modules/auth/session";

/**
 * RBAC enforcement helpers.
 *
 * CRITICAL: every protected server action / API route MUST call one of these
 * functions itself. Hiding a button in the UI is never sufficient — the
 * server always re-checks. This module is the single choke point so
 * authorization logic isn't duplicated (and potentially inconsistently
 * re-implemented) across dozens of route handlers.
 */

/** Throws 401 if there is no valid session. Returns the session otherwise. */
export async function requireAuth(): Promise<AuthSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw ApiError.unauthorized();
  }
  return session;
}

/** Throws 401/403 unless the current user holds at least one of `roles`. */
export async function requireRole(...roles: Role[]): Promise<AuthSession> {
  const session = await requireAuth();
  const hasRole = session.user.roles.some((r) => roles.includes(r));
  if (!hasRole) {
    throw ApiError.forbidden(`Requires one of roles: ${roles.join(", ")}`);
  }
  return session;
}

export function hasRole(session: AuthSession, ...roles: Role[]): boolean {
  return session.user.roles.some((r) => roles.includes(r));
}

/** Convenience predicates used throughout the codebase for readability. */
export const isAdmin = (session: AuthSession) => hasRole(session, "ADMIN", "SUPER_ADMIN");

export const isSuperAdmin = (session: AuthSession) => hasRole(session, "SUPER_ADMIN");

export const isRestaurantStaffRole = (session: AuthSession) =>
  hasRole(session, "RESTAURANT_OWNER", "RESTAURANT_STAFF");

export const isCourier = (session: AuthSession) => hasRole(session, "COURIER");

export const isSupport = (session: AuthSession) => hasRole(session, "SUPPORT");
