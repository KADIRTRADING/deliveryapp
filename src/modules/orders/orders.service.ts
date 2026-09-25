import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { AuthSession } from "@/modules/auth/rbac";
import { isAdmin } from "@/modules/auth/rbac";
import { requireBranchAccess } from "@/modules/restaurants/access";
import {
  assertValidTransition,
  roleCanTransitionTo,
  CUSTOMER_CANCELLABLE_STATUSES,
} from "@/modules/orders/status-machine";
import { publishOrderStatusEvent } from "@/modules/orders/realtime";
import { notifyOrderStatusChange } from "@/modules/notifications/notifications.service";
import type { OrderStatus, Role } from "@prisma/client";

const orderInclude = {
  items: { include: { modifiers: true } },
  restaurant: {
    select: { id: true, slug: true, nameUz: true, nameRu: true, nameEn: true, logoUrl: true },
  },
  branch: { select: { id: true, name: true, phone: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
} as const;

/**
 * Fetch a single order, scoped to the requesting customer — an ordinary
 * customer may only ever see their own orders. Restaurant staff/admin
 * access to orders they need to fulfill is authorized separately (Phase 5's
 * restaurant dashboard), not through this function.
 */
export async function getOrderForCustomer(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: orderInclude,
  });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  return order;
}

export async function listOrdersForCustomer(
  userId: string,
  opts?: { page?: number; pageSize?: number },
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return { items, total, page, pageSize };
}

/**
 * List orders for a specific branch — the restaurant dashboard's "incoming
 * orders" view. Access is authorized by the caller (route handler) via
 * requireBranchAccess before this is called; this function itself performs
 * no authorization so it stays a pure data-access function.
 */
export async function listOrdersForBranch(
  branchId: string,
  opts?: { status?: OrderStatus; page?: number; pageSize?: number },
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: { branchId, ...(opts?.status ? { status: opts.status } : {}) },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where: { branchId, ...(opts?.status ? { status: opts.status } : {}) } }),
  ]);

  return { items, total, page, pageSize };
}

/**
 * Fetch a single order for restaurant-dashboard/management purposes.
 * Callers MUST authorize branch access (requireBranchAccess) before calling
 * this — unlike getOrderForCustomer, this intentionally does not filter by
 * userId, since restaurant staff need to see orders placed by any customer.
 */
export async function getOrderForRestaurant(branchId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, branchId },
    include: orderInclude,
  });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  return order;
}

interface AdvanceOptions {
  reason?: string | null;
}

/**
 * Advance an order to a new status, enforcing (in order):
 * 1. The transition is legal per the state machine (assertValidTransition).
 * 2. The actor is authorized to drive that specific transition: admins
 *    always may; otherwise the actor's role must be listed in
 *    TRANSITION_ACTOR_ROLES for the target status, AND — for
 *    restaurant-side transitions — the actor must have branch access via
 *    requireBranchAccess (courier-assignment authorization is checked
 *    separately in Phase 8's courier module).
 *
 * Writes an OrderStatusHistory row and publishes a realtime event inside
 * the same database transaction's success path, matching the immutable
 * audit-trail requirement ("Store immutable status history with status,
 * timestamp, actor and optional reason").
 */
export async function advanceOrderStatus(
  session: AuthSession,
  orderId: string,
  targetStatus: OrderStatus,
  opts?: AdvanceOptions,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }

  assertValidTransition(order.status, targetStatus);

  const actorRole = resolveActingRole(session, targetStatus);
  if (!isAdmin(session)) {
    if (!actorRole) {
      throw ApiError.forbidden(
        `You do not have permission to move an order to status ${targetStatus}.`,
      );
    }
    if (actorRole === "RESTAURANT_OWNER" || actorRole === "RESTAURANT_STAFF") {
      await requireBranchAccess(session, order.branchId);
    }
    // COURIER-driven transitions are authorized against the specific
    // CourierAssignment in Phase 8's courier module, which calls this
    // function only after confirming the acting courier owns the
    // relevant assignment.
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: targetStatus,
        ...(targetStatus === "ACCEPTED" ? { acceptedAt: new Date() } : {}),
        ...(targetStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(targetStatus === "CANCELLED"
          ? { cancelledAt: new Date(), cancelReason: opts?.reason ?? null }
          : {}),
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        status: targetStatus,
        actorUserId: session.user.id,
        actorRole: actorRole ?? undefined,
        reason: opts?.reason ?? null,
      },
    });
  });

  await publishOrderStatusEvent({
    orderId,
    status: targetStatus,
    createdAt: new Date().toISOString(),
  });
  await notifyOrderStatusChange(order.userId, orderId, order.orderNumber, targetStatus);
}

/**
 * System-driven status advancement — used when the actor is not a human
 * session but a verified external event (a payment webhook; see
 * payments.service.ts). Bypasses role/branch-access checks entirely
 * (there is no session to check them against) but still enforces the
 * state machine's transition legality via assertValidTransition, and
 * still writes an immutable OrderStatusHistory row (with a null
 * actorUserId/actorRole to make it visually distinct from a human-driven
 * transition in the audit trail) and publishes the realtime event.
 *
 * This function must NEVER be reachable from a route handler directly —
 * only from server-side code that has already independently verified the
 * event's authenticity (e.g. a payment provider's webhook signature).
 */
export async function advanceOrderStatusSystem(
  orderId: string,
  targetStatus: OrderStatus,
  opts?: AdvanceOptions,
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }

  assertValidTransition(order.status, targetStatus);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: targetStatus,
        ...(targetStatus === "PAID" ? {} : {}),
        ...(targetStatus === "CANCELLED"
          ? { cancelledAt: new Date(), cancelReason: opts?.reason ?? null }
          : {}),
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        status: targetStatus,
        actorUserId: null,
        actorRole: null,
        reason: opts?.reason ?? "Automated system transition",
      },
    });
  });

  await publishOrderStatusEvent({
    orderId,
    status: targetStatus,
    createdAt: new Date().toISOString(),
  });
  await notifyOrderStatusChange(order.userId, orderId, order.orderNumber, targetStatus);
}

/** Pick the role under which `session` is acting for this transition, for audit-trail purposes. */
function resolveActingRole(session: AuthSession, targetStatus: OrderStatus): Role | null {
  for (const role of session.user.roles) {
    if (roleCanTransitionTo(role, targetStatus)) {
      return role;
    }
  }
  return null;
}

/**
 * Customer-initiated cancellation, subject to "Cancel according to
 * configurable rules": only orders in CUSTOMER_CANCELLABLE_STATUSES may be
 * self-cancelled by the customer who placed them. Restaurant/support-driven
 * cancellation (broader status range) goes through advanceOrderStatus
 * directly with the RESTAURANT_STAFF/RESTAURANT_OWNER/SUPPORT role.
 */
export async function cancelOrderAsCustomer(
  session: AuthSession,
  orderId: string,
  reason?: string | null,
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: session.user.id } });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(order.status)) {
    throw ApiError.conflict(
      `This order can no longer be cancelled (current status: ${order.status}).`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        status: "CANCELLED",
        actorUserId: session.user.id,
        actorRole: "CUSTOMER",
        reason: reason ?? "Cancelled by customer",
      },
    });
  });

  await publishOrderStatusEvent({
    orderId,
    status: "CANCELLED",
    createdAt: new Date().toISOString(),
  });
  await notifyOrderStatusChange(order.userId, orderId, order.orderNumber, "CANCELLED");
}
