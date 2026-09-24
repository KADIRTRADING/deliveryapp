import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireProductAccess } from "@/modules/restaurants/access";
import { getProduct, updateProduct, deleteProduct } from "@/modules/menu/products.service";
import { updateProductSchema } from "@/modules/menu/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/products/:id — management product detail (owner/staff/admin). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { restaurantId } = await requireProductAccess(session, id);
    const product = await getProduct(restaurantId, id);
    return NextResponse.json({ product }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/products/:id — owner/staff/admin: edit a product, its variants, and modifiers. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { restaurantId } = await requireProductAccess(session, id, { roles: ["OWNER", "STAFF"] });

    const body = await req.json();
    const input = updateProductSchema.parse(body);
    const product = await updateProduct(restaurantId, id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "PRODUCT_UPDATED",
      entityType: "Product",
      entityId: id,
    });

    return NextResponse.json({ product }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/products/:id — owner/staff/admin: soft-delete a product. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { restaurantId } = await requireProductAccess(session, id, { roles: ["OWNER", "STAFF"] });

    await deleteProduct(restaurantId, id);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "PRODUCT_DELETED",
      entityType: "Product",
      entityId: id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
