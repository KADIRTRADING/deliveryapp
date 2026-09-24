import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireProductAccess } from "@/modules/restaurants/access";
import { deleteProductImage } from "@/modules/menu/products.service";
import { getStorageProvider } from "@/modules/storage/storage-provider";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string; imageId: string }>;
}

/**
 * DELETE /api/products/:id/images/:imageId — owner/staff/admin: remove a
 * product image, deleting both the database record and the underlying
 * storage object (best-effort — a storage-delete failure does not block
 * removing the reference, matching the "deletion, replacement" requirement
 * without letting a transient storage-provider error corrupt the product's
 * gallery order).
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id, imageId } = await params;
    const { restaurantId } = await requireProductAccess(session, id, { roles: ["OWNER", "STAFF"] });

    const image = await prisma.productImage.findFirst({
      where: { id: imageId, productId: id, product: { restaurantId } },
    });

    await deleteProductImage(restaurantId, id, imageId);

    if (image) {
      const key = extractStorageKey(image.url);
      if (key) {
        try {
          await getStorageProvider().deleteObject(key);
        } catch {
          // Best-effort: the DB reference is already removed; a lingering
          // orphaned object in storage is a cleanup concern, not a
          // correctness one, and must never block this request.
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Best-effort extraction of the storage key from a public object URL. */
function extractStorageKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
}
