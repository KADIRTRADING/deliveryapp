import { NextRequest, NextResponse } from "next/server";
import { requestPasswordResetSchema } from "@/modules/auth/schemas";
import { requestPasswordReset } from "@/modules/auth/auth.service";
import { getSmsProvider } from "@/modules/notifications/sms-provider";
import { env } from "@/lib/env";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const rl = await RateLimits.passwordResetPerIp(ip);
    if (!rl.allowed) {
      throw ApiError.tooManyRequests("Too many requests. Try again later.");
    }

    const body = await req.json();
    const input = requestPasswordResetSchema.parse(body);

    const token = await requestPasswordReset(input.phone);
    if (token) {
      const resetLink = `${env.APP_URL}/reset-password?token=${token}`;
      await getSmsProvider().sendSms(
        input.phone,
        `DeliveryApp: reset your password using this link (valid 30 minutes): ${resetLink}`,
      );
    }

    // Always respond identically whether or not the account exists.
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
