import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import { listProducts, createProduct } from "@/modules/menu/products.service";
import { createProductSchema } from "@/modules/menu/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/restaurants/:id/products — management product list (owner/staff/
 * admin; includes unavailable products). For public menu browsing, this
 * same restaurant's approved-only view is embedded in the restaurant detail
 * response (Phase 2's getRestaurantBySlug) — a dedicated public menu
 * endpoint with full product/variant/modifier detail is added alongside the
 * customer-facing restaurant page UI.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id);
    const products = await listProducts(id, { includeUnavailable: true });
    return NextResponse.json({ products }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/restaurants/:id/products — owner/staff/admin: create a product,
 * optionally with its variants and modifier groups/options in one call.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id, { roles: ["OWNER", "STAFF"] });

    const body = await req.json();
    const input = createProductSchema.parse(body);
    const product = await createProduct(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "PRODUCT_CREATED",
      entityType: "Product",
      entityId: product.id,
      metadata: { restaurantId: id },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
