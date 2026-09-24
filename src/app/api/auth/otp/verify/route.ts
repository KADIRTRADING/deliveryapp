import { NextRequest, NextResponse } from "next/server";
import { verifyOtpSchema } from "@/modules/auth/schemas";
import { verifyOtp } from "@/modules/auth/otp.service";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = verifyOtpSchema.parse(body);

    const limit = await RateLimits.otpVerifyPerPhone(input.phone);
    if (!limit.allowed) {
      throw ApiError.tooManyRequests("Too many attempts. Request a new code.");
    }

    await verifyOtp(input.phone, input.purpose, input.code);

    // For VERIFY_PHONE / CHANGE_PHONE purposes on an authenticated flow, the
    // caller is expected to have already resolved the user; for a bare OTP
    // check (e.g. pre-registration) we simply confirm validity here. Marking
    // phoneVerifiedAt happens in the dedicated profile endpoint so that this
    // route stays a pure "is this code correct" primitive reusable by
    // multiple flows (register, login-by-otp, reset password).
    if (input.purpose === "VERIFY_PHONE") {
      await prisma.user.updateMany({
        where: { phone: input.phone },
        data: { phoneVerifiedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
