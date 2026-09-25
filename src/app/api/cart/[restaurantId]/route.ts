import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import {
  getCart,
  addCartItem,
  clearCart,
  updateCartNotes,
  priceCart,
} from "@/modules/cart/cart.service";
import { addCartItemSchema, updateCartNotesSchema } from "@/modules/cart/schemas";
import { handleApiError, ApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ restaurantId: string }>;
}

/** GET /api/cart/:restaurantId — fetch the authenticated user's cart for this restaurant, with live server-computed prices. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId } = await params;
    const cart = await getCart(session.user.id, restaurantId);
    const priced = await priceCart(cart);
    return NextResponse.json({ cart, pricing: priced }, { status: 200 });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return NextResponse.json(
        { cart: null, pricing: { lines: [], subtotalAmount: 0 } },
        { status: 200 },
      );
    }
    return handleApiError(err);
  }
}

/** POST /api/cart/:restaurantId — add an item to the cart. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId } = await params;
    const body = await req.json();
    const input = addCartItemSchema.parse(body);

    const { cart } = await addCartItem(session.user.id, restaurantId, input);
    const priced = await priceCart(cart);

    return NextResponse.json({ cart, pricing: priced }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/cart/:restaurantId — update cart-level notes. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId } = await params;
    const body = await req.json();
    const input = updateCartNotesSchema.parse(body);

    const cart = await updateCartNotes(session.user.id, restaurantId, input.notes);
    const priced = await priceCart(cart);

    return NextResponse.json({ cart, pricing: priced }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/cart/:restaurantId — clear the entire cart for this restaurant. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { restaurantId } = await params;
    await clearCart(session.user.id, restaurantId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
