import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { requireOwnAssignment } from "@/modules/couriers/access";
import { buildNavigationUrl } from "@/modules/couriers/couriers.service";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/couriers/me/assignments/:id/navigation — a maps deep-link for
 * this delivery. Before the courier has picked up the order, this points
 * from the branch to the pickup point (the branch itself); after pickup,
 * it points from the branch to the customer's delivery address — the
 * courier's own current location is supplied by their device as the map
 * app's live origin, not embedded in this link.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("COURIER");
    const { id } = await params;
    const { assignment } = await requireOwnAssignment(session, id);

    const [branch, order] = await Promise.all([
      prisma.restaurantBranch.findUnique({ where: { id: assignment.branchId } }),
      prisma.order.findUnique({ where: { id: assignment.orderId } }),
    ]);
    if (!branch || !order) {
      throw ApiError.notFound("Assignment details not found");
    }

    const destination =
      assignment.status === "PICKED_UP"
        ? { latitude: order.latitude, longitude: order.longitude }
        : { latitude: branch.latitude, longitude: branch.longitude };

    const navigationUrl = buildNavigationUrl(
      { latitude: branch.latitude, longitude: branch.longitude },
      destination,
    );

    return NextResponse.json({ navigationUrl }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
