import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { AuthSession } from "@/modules/auth/rbac";

/**
 * Courier-scoped authorization. Mirrors the pattern in
 * src/modules/restaurants/access.ts: every courier-facing mutation must
 * resolve and check that the acting user actually IS the courier who owns
 * the relevant Courier/CourierAssignment row — a courier must never be able
 * to act on another courier's assignment, location, or delivery by simply
 * guessing/enumerating an id.
 */

export async function requireCourierProfile(session: AuthSession) {
  const courier = await prisma.courier.findUnique({ where: { userId: session.user.id } });
  if (!courier) {
    throw ApiError.forbidden("You do not have a courier profile.");
  }
  if (courier.status !== "ACTIVE") {
    throw ApiError.forbidden("Your courier account is suspended.");
  }
  return courier;
}

/** Resolve a CourierAssignment and verify it belongs to the acting courier. */
export async function requireOwnAssignment(session: AuthSession, assignmentId: string) {
  const courier = await requireCourierProfile(session);
  const assignment = await prisma.courierAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.courierId !== courier.id) {
    throw ApiError.notFound("Assignment not found");
  }
  return { courier, assignment };
}
