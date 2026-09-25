/**
 * Order lifecycle state machine.
 *
 * Per "Validate allowed transitions server-side": this module is the single
 * source of truth for which OrderStatus transitions are legal, and which
 * role is permitted to perform each one. No route handler or service
 * function should ever write `Order.status` directly — always go through
 * `assertValidTransition` (see orders.service.ts's `advanceOrderStatus`).
 *
 * Lifecycle (see prisma/schema.prisma's OrderStatus enum):
 *
 *   PENDING ─────────────┐
 *      │ (cash)          │ (online payment)
 *      ▼                 ▼
 *   ACCEPTED         PAYMENT_PENDING ──► PAID ──► ACCEPTED
 *      │                                            (restaurant accepts either way)
 *      ▼
 *   PREPARING ──► READY_FOR_PICKUP ──► COURIER_ASSIGNED ──► PICKED_UP ──► ON_THE_WAY ──► DELIVERED
 *
 *   CANCELLED can be reached from PENDING/PAYMENT_PENDING/PAID/ACCEPTED/PREPARING
 *   (see CANCELLABLE_STATUSES in orders.service.ts for the customer-facing subset).
 *   REFUNDED is only reachable from PAID, ACCEPTED, PREPARING, or CANCELLED
 *   (a completed online payment that must be returned).
 */
import type { OrderStatus, Role } from "@prisma/client";

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["ACCEPTED", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "CANCELLED"],
  PAID: ["ACCEPTED", "CANCELLED", "REFUNDED"],
  ACCEPTED: ["PREPARING", "CANCELLED", "REFUNDED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED", "REFUNDED"],
  READY_FOR_PICKUP: ["COURIER_ASSIGNED"],
  COURIER_ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["ON_THE_WAY"],
  ON_THE_WAY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: ["REFUNDED"],
  REFUNDED: [],
};

/**
 * Which role(s) may perform a transition INTO the given target status.
 * ADMIN/SUPER_ADMIN can always perform any transition (platform override),
 * so they are intentionally omitted here and checked separately.
 */
export const TRANSITION_ACTOR_ROLES: Record<OrderStatus, Role[]> = {
  PENDING: [],
  PAYMENT_PENDING: [],
  PAID: [], // set by a verified payment webhook, not a role-based actor
  ACCEPTED: ["RESTAURANT_OWNER", "RESTAURANT_STAFF"],
  PREPARING: ["RESTAURANT_OWNER", "RESTAURANT_STAFF"],
  READY_FOR_PICKUP: ["RESTAURANT_OWNER", "RESTAURANT_STAFF"],
  COURIER_ASSIGNED: ["RESTAURANT_OWNER", "RESTAURANT_STAFF", "SUPPORT"],
  PICKED_UP: ["COURIER"],
  ON_THE_WAY: ["COURIER"],
  DELIVERED: ["COURIER"],
  CANCELLED: ["CUSTOMER", "RESTAURANT_OWNER", "RESTAURANT_STAFF", "SUPPORT"],
  REFUNDED: ["SUPPORT"],
};

/** Statuses a CUSTOMER themselves is allowed to cancel from — per "Cancel according to configurable rules." */
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  "PENDING",
  "PAYMENT_PENDING",
  "PAID",
  "ACCEPTED",
];

export class InvalidTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot transition order from ${from} to ${to}.`);
  }
}

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (!isValidTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/**
 * Whether `role` is permitted to drive the transition into `to`, given they
 * are not an admin (admins bypass this check entirely at the call site).
 */
export function roleCanTransitionTo(role: Role, to: OrderStatus): boolean {
  return TRANSITION_ACTOR_ROLES[to].includes(role);
}
