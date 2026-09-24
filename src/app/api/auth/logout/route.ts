import { NextResponse } from "next/server";
import { getSessionCookieToken, revokeSession, clearSessionCookie } from "@/modules/auth/session";
import { handleApiError } from "@/lib/api-error";

export async function POST() {
  try {
    const token = await getSessionCookieToken();
    if (token) {
      await revokeSession(token);
    }
    await clearSessionCookie();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
