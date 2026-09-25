import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { listMyNotifications } from "@/modules/notifications/notifications.service";
import { handleApiError } from "@/lib/api-error";
import { z } from "zod";

const querySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

/** GET /api/notifications — the authenticated user's in-app notifications. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { unreadOnly, page, pageSize } = querySchema.parse({
      unreadOnly: req.nextUrl.searchParams.get("unreadOnly") ?? undefined,
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: req.nextUrl.searchParams.get("pageSize") ?? undefined,
    });

    const result = await listMyNotifications(session.user.id, { unreadOnly, page, pageSize });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
