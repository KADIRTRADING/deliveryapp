import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/modules/auth/schemas";
import { registerUser } from "@/modules/auth/auth.service";
import { toPublicUser } from "@/modules/auth/dto";
import { setSessionCookie } from "@/modules/auth/session";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = await RateLimits.registerPerIp(ip);
    if (!rl.allowed) {
      throw ApiError.tooManyRequests("Too many registration attempts. Try again later.");
    }

    const body = await req.json();
    const input = registerSchema.parse(body);

    const { user, token } = await registerUser(input, {
      ipAddress: ip,
      userAgent: req.headers.get("user-agent"),
    });

    await setSessionCookie(token);

    return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
