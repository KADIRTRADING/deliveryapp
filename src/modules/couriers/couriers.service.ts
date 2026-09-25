import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { haversineDistanceMeters } from "@/lib/geo";
import type { AuthSession } from "@/modules/auth/rbac";
import { requireCourierProfile, requireOwnAssignment } from "@/modules/couriers/access";

/**
 * Toggle a courier's online/offline availability. Going offline does not
 * cancel any assignment currently in progress — a courier who already
 * accepted a delivery must still complete it; this only affects whether
 * they receive NEW assignment offers going forward.
 */
export async function setOnlineStatus(session: AuthSession, isOnline: boolean) {
  const courier = await requireCourierProfile(session);
  return prisma.courier.update({
    where: { id: courier.id },
    data: { isOnline },
  });
}

/**
 * Update a courier's live location. Per "Protect courier location data":
 * this is written by the courier themselves only, and is never exposed
 * through any public/customer-facing endpoint — only to the restaurant
 * staff/admin managing the specific order the courier is delivering (see
 * getAssignmentLocationForOrder below), and only for the duration of an
 * active assignment.
 */
export async function updateLocation(session: AuthSession, latitude: number, longitude: number) {
  const courier = await requireCourierProfile(session);
  return prisma.courier.update({
    where: { id: courier.id },
    data: { currentLatitude: latitude, currentLongitude: longitude, locationUpdatedAt: new Date() },
  });
}

/**
 * Restaurant/admin-facing lookup of a courier's current location, scoped
 * to one specific order's active assignment — never a general "where is
 * courier X" query. Returns null if there is no active assignment for this
 * order (nothing to show), rather than throwing, since "no courier
 * assigned yet" is an expected, unremarkable state.
 */
export async function getAssignmentLocationForOrder(orderId: string) {
  const assignment = await prisma.courierAssignment.findFirst({
    where: { orderId, status: { in: ["ACCEPTED", "PICKED_UP"] } },
    include: {
      courier: {
        select: { currentLatitude: true, currentLongitude: true, locationUpdatedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!assignment) return null;
  return {
    latitude: assignment.courier.currentLatitude,
    longitude: assignment.courier.currentLongitude,
    updatedAt: assignment.courier.locationUpdatedAt,
  };
}

/**
 * Offer a delivery to the nearest available online courier(s) once an
 * order reaches READY_FOR_PICKUP. Called from orders.service.ts's
 * advanceOrderStatus when the target status is READY_FOR_PICKUP.
 *
 * Selection strategy: rank online, ACTIVE couriers by real Haversine
 * distance from the branch (never a fake/estimated value) and create an
 * OFFERED assignment for the single nearest one. If that courier rejects
 * the offer, a restaurant/admin can call this function again to offer the
 * next-nearest courier — this keeps the matching logic simple and
 * observable rather than a black-box broadcast-to-everyone model, while
 * still being easy to extend into a broadcast/expiring-offer system later
 * without changing the CourierAssignment schema.
 */
export async function offerNearestCourier(orderId: string, branchId: string) {
  const branch = await prisma.restaurantBranch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw ApiError.notFound("Branch not found");
  }

  // Exclude couriers who have already been offered (and, in particular,
  // already rejected) this specific order — otherwise a rejection would
  // just be re-offered to the same nearest courier on every retry.
  const alreadyConsidered = await prisma.courierAssignment.findMany({
    where: { orderId },
    select: { courierId: true },
  });
  const excludedCourierIds = alreadyConsidered.map((a) => a.courierId);

  const onlineCouriers = await prisma.courier.findMany({
    where: {
      isOnline: true,
      status: "ACTIVE",
      currentLatitude: { not: null },
      currentLongitude: { not: null },
      id: excludedCourierIds.length > 0 ? { notIn: excludedCourierIds } : undefined,
    },
  });

  if (onlineCouriers.length === 0) {
    return null;
  }

  const ranked = onlineCouriers
    .map((courier) => ({
      courier,
      distanceMeters: haversineDistanceMeters(
        { latitude: branch.latitude, longitude: branch.longitude },
        { latitude: courier.currentLatitude!, longitude: courier.currentLongitude! },
      ),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearest = ranked[0];
  if (!nearest) return null;

  return prisma.courierAssignment.create({
    data: {
      courierId: nearest.courier.id,
      orderId,
      branchId,
      status: "OFFERED",
    },
  });
}

export async function listMyAssignments(session: AuthSession, opts?: { activeOnly?: boolean }) {
  const courier = await requireCourierProfile(session);
  return prisma.courierAssignment.findMany({
    where: {
      courierId: courier.id,
      ...(opts?.activeOnly ? { status: { in: ["OFFERED", "ACCEPTED", "PICKED_UP"] } } : {}),
    },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          addressSnapshot: true,
          latitude: true,
          longitude: true,
          totalAmount: true,
        },
      },
      branch: {
        select: { id: true, name: true, addressLine: true, latitude: true, longitude: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Accept or reject an offered assignment. A courier may only respond to
 * their own OFFERED assignment (requireOwnAssignment resolves and checks
 * ownership). Accepting also drives the order's own status to
 * COURIER_ASSIGNED through the existing state machine — one order can
 * have only one currently-active assignment, so acceptance is the
 * authoritative moment the order "has a courier."
 */
export async function respondToAssignment(
  session: AuthSession,
  assignmentId: string,
  action: "ACCEPT" | "REJECT",
) {
  const { assignment } = await requireOwnAssignment(session, assignmentId);

  if (assignment.status !== "OFFERED") {
    throw ApiError.conflict(
      `This assignment is no longer awaiting a response (status: ${assignment.status}).`,
    );
  }

  if (action === "REJECT") {
    return prisma.courierAssignment.update({
      where: { id: assignmentId },
      data: { status: "REJECTED" },
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.courierAssignment.update({
      where: { id: assignmentId },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    await tx.order.update({
      where: { id: assignment.orderId },
      data: { status: "COURIER_ASSIGNED" },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: assignment.orderId,
        status: "COURIER_ASSIGNED",
        actorUserId: session.user.id,
        actorRole: "COURIER",
        reason: "Courier accepted delivery",
      },
    });

    return updated;
  });
}

/**
 * Courier-driven delivery progress: PICKED_UP -> ON_THE_WAY -> DELIVERED.
 * This is the courier-side half of orders.service.ts's advanceOrderStatus
 * comment ("COURIER-driven transitions are authorized against the specific
 * CourierAssignment") — a courier may only advance an order if they hold
 * the ACCEPTED assignment for it, closing the gap that module left for
 * this phase.
 */
export async function advanceDeliveryStatus(
  session: AuthSession,
  assignmentId: string,
  targetStatus: "PICKED_UP" | "ON_THE_WAY" | "DELIVERED",
) {
  const { assignment } = await requireOwnAssignment(session, assignmentId);

  if (assignment.status !== "ACCEPTED" && assignment.status !== "PICKED_UP") {
    throw ApiError.conflict("This assignment is not in a state that can be advanced.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: assignment.orderId },
      data: {
        status: targetStatus,
        ...(targetStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: assignment.orderId,
        status: targetStatus,
        actorUserId: session.user.id,
        actorRole: "COURIER",
      },
    });

    const updated = await tx.courierAssignment.update({
      where: { id: assignmentId },
      data: {
        status: targetStatus === "DELIVERED" ? "DELIVERED" : "PICKED_UP",
        ...(targetStatus === "PICKED_UP" ? { pickedUpAt: new Date() } : {}),
        ...(targetStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}),
      },
    });

    return updated;
  });
}

export async function listCourierHistory(
  session: AuthSession,
  opts?: { page?: number; pageSize?: number },
) {
  const courier = await requireCourierProfile(session);
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.courierAssignment.findMany({
      where: {
        courierId: courier.id,
        status: { in: ["DELIVERED", "REJECTED", "CANCELLED", "EXPIRED"] },
      },
      include: {
        order: { select: { id: true, orderNumber: true, totalAmount: true, deliveredAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.courierAssignment.count({
      where: {
        courierId: courier.id,
        status: { in: ["DELIVERED", "REJECTED", "CANCELLED", "EXPIRED"] },
      },
    }),
  ]);

  return { items, total, page, pageSize };
}

/**
 * Build a maps deep-link the courier's phone can open directly in their
 * preferred navigation app, from the branch (pickup) to the delivery
 * address (dropoff) — per "open navigation." Uses Google Maps' documented
 * universal directions URL scheme, which works across platforms (opens the
 * Google Maps app if installed, else falls back to the web) without
 * requiring any navigation SDK or API key.
 */
export function buildNavigationUrl(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin.latitude},${origin.longitude}`);
  url.searchParams.set("destination", `${destination.latitude},${destination.longitude}`);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}
