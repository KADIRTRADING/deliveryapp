import { NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { markAllNotificationsRead } from "@/modules/notifications/notifications.service";
import { handleApiError } from "@/lib/api-error";

/** POST /api/notifications/read-all — mark all of the authenticated user's notifications as read. */
export async function POST() {
  try {
    const session = await requireAuth();
    await markAllNotificationsRead(session.user.id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
