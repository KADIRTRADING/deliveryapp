import { NextRequest, NextResponse } from "next/server";
import { requestOtpSchema } from "@/modules/auth/schemas";
import { requestOtp } from "@/modules/auth/otp.service";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = requestOtpSchema.parse(body);

    const [ipLimit, phoneLimit] = await Promise.all([
      RateLimits.otpRequestPerPhone(getClientIp(req.headers)),
      RateLimits.otpRequestPerPhone(input.phone),
    ]);
    if (!ipLimit.allowed || !phoneLimit.allowed) {
      throw ApiError.tooManyRequests("Too many code requests. Try again later.");
    }

    await requestOtp(input.phone, input.purpose);

    // Deliberately do not reveal whether the phone number has an existing
    // account — the caller only learns that a code was sent, if applicable.
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
