import { NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { listFavoriteRestaurants } from "@/modules/favorites/favorites.service";
import { handleApiError } from "@/lib/api-error";

/** GET /api/favorites/restaurants — the authenticated user's favorited restaurants. */
export async function GET() {
  try {
    const session = await requireAuth();
    const favorites = await listFavoriteRestaurants(session.user.id);
    return NextResponse.json({ favorites }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
