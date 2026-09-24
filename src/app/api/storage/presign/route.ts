import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { presignUploadSchema } from "@/modules/storage/schemas";
import { getStorageProvider } from "@/modules/storage/storage-provider";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/storage/presign — request a short-lived, scoped presigned
 * upload URL for a restaurant logo/cover, product image, or category icon.
 *
 * Authorization is at the *role* level here (any restaurant staff/owner or
 * admin may request an upload slot); the resulting URL only becomes
 * meaningful once it is attached to a specific restaurant/product/category
 * via that resource's own PATCH endpoint, which enforces resource-level
 * authorization (requireRestaurantAccess / ADMIN-only for categories) at
 * that point. A presigned URL by itself grants only the ability to upload
 * one object to one generated key — it cannot overwrite or read anything
 * else in the bucket.
 *
 * Category icons are admin-only since RestaurantCategory is platform-wide
 * reference data, not restaurant-owned.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(
      "RESTAURANT_OWNER",
      "RESTAURANT_STAFF",
      "ADMIN",
      "SUPER_ADMIN",
    );

    const ip = getClientIp(req.headers);
    const limit = await RateLimits.apiWritePerUser(session.user.id + ip);
    if (!limit.allowed) {
      throw ApiError.tooManyRequests("Too many upload requests. Try again shortly.");
    }

    const body = await req.json();
    const input = presignUploadSchema.parse(body);

    if (
      input.folder === "categories/icons" &&
      !session.user.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN")
    ) {
      throw ApiError.forbidden("Only admins can upload category icons.");
    }

    const provider = getStorageProvider();
    const presigned = await provider.createPresignedUpload(input.folder, input.contentType);

    return NextResponse.json({ upload: presigned }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
