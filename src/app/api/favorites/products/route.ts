import { NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { listFavoriteProducts } from "@/modules/favorites/favorites.service";
import { handleApiError } from "@/lib/api-error";

/** GET /api/favorites/products — the authenticated user's favorited products/dishes. */
export async function GET() {
  try {
    const session = await requireAuth();
    const favorites = await listFavoriteProducts(session.user.id);
    return NextResponse.json({ favorites }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
