import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/modules/auth/schemas";
import { loginUser } from "@/modules/auth/auth.service";
import { toPublicUser } from "@/modules/auth/dto";
import { setSessionCookie } from "@/modules/auth/session";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const body = await req.json();
    const input = loginSchema.parse(body);

    const [ipLimit, phoneLimit] = await Promise.all([
      RateLimits.loginPerIp(ip),
      RateLimits.loginPerPhone(input.phone),
    ]);
    if (!ipLimit.allowed || !phoneLimit.allowed) {
      throw ApiError.tooManyRequests("Too many login attempts. Try again later.");
    }

    const { user, token } = await loginUser(input, {
      ipAddress: ip,
      userAgent: req.headers.get("user-agent"),
    });

    await setSessionCookie(token);

    return NextResponse.json({ user: toPublicUser(user) }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
