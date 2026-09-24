import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireProductAccess } from "@/modules/restaurants/access";
import { addProductImage } from "@/modules/menu/products.service";
import { addProductImageSchema } from "@/modules/menu/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/products/:id/images — attach an already-uploaded image (see
 * POST /api/storage/presign for obtaining the upload URL first) to a
 * product.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { restaurantId } = await requireProductAccess(session, id, { roles: ["OWNER", "STAFF"] });

    const body = await req.json();
    const input = addProductImageSchema.parse(body);
    const image = await addProductImage(restaurantId, id, input);

    return NextResponse.json({ image }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
