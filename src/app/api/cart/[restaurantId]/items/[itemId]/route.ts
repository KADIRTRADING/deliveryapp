import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { updateCartItem, removeCartItem, priceCart } from "@/modules/cart/cart.service";
import { updateCartItemSchema } from "@/modules/cart/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ restaurantId: string; itemId: string }>;
}

/** PATCH /api/cart/:restaurantId/items/:itemId — change quantity/variant/modifiers/notes for a cart item. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId, itemId } = await params;
    const body = await req.json();
    const input = updateCartItemSchema.parse(body);

    const cart = await updateCartItem(session.user.id, restaurantId, itemId, input);
    const priced = await priceCart(cart);

    return NextResponse.json({ cart, pricing: priced }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/cart/:restaurantId/items/:itemId — remove a single item from the cart. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId, itemId } = await params;

    const cart = await removeCartItem(session.user.id, restaurantId, itemId);
    const priced = await priceCart(cart);

    return NextResponse.json({ cart, pricing: priced }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
