import { NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { listUserCarts } from "@/modules/cart/cart.service";
import { handleApiError } from "@/lib/api-error";

/** GET /api/cart — list all of the authenticated user's non-empty carts (one per restaurant). */
export async function GET() {
  try {
    const session = await requireAuth();
    const carts = await listUserCarts(session.user.id);
    return NextResponse.json({ carts }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
