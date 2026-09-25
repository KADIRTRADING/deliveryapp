import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import {
  addFavoriteRestaurant,
  removeFavoriteRestaurant,
} from "@/modules/favorites/favorites.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ restaurantId: string }>;
}

/** PUT /api/favorites/restaurants/:restaurantId — add a restaurant to favorites (idempotent). */
export async function PUT(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId } = await params;
    const favorite = await addFavoriteRestaurant(session.user.id, restaurantId);
    return NextResponse.json({ favorite }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/favorites/restaurants/:restaurantId — remove a restaurant from favorites. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId } = await params;
    await removeFavoriteRestaurant(session.user.id, restaurantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
