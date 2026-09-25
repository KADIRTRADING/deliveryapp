import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { addFavoriteProduct, removeFavoriteProduct } from "@/modules/favorites/favorites.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ productId: string }>;
}

/** PUT /api/favorites/products/:productId — add a product/dish to favorites (idempotent). */
export async function PUT(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { productId } = await params;
    const favorite = await addFavoriteProduct(session.user.id, productId);
    return NextResponse.json({ favorite }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/favorites/products/:productId — remove a product/dish from favorites. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { productId } = await params;
    await removeFavoriteProduct(session.user.id, productId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
