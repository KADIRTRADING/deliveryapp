import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAdmin } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import { getAssignmentLocationForOrder } from "@/modules/couriers/couriers.service";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/orders/:id/courier-location — the assigned courier's current
 * location for this specific order. Per "Protect courier location data":
 * accessible only to the customer who placed the order (so they can see
 * their delivery approaching) or to the order's restaurant staff/admin —
 * never a public or general-purpose "look up any courier" endpoint.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, restaurantId: true },
    });
    if (!order) {
      throw ApiError.notFound("Order not found");
    }

    const isOwningCustomer = order.userId === session.user.id;
    if (!isOwningCustomer && !isAdmin(session)) {
      await requireRestaurantAccess(session, order.restaurantId);
    }

    const location = await getAssignmentLocationForOrder(id);
    return NextResponse.json({ location }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
