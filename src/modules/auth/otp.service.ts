import "server-only";
import { prisma } from "@/lib/prisma";
import { sha256Hex, generateNumericOtp } from "@/lib/crypto";
import { getSmsProvider } from "@/modules/notifications/sms-provider";
import { ApiError } from "@/lib/api-error";
import type { OtpPurpose } from "@prisma/client";

const OTP_TTL_MINUTES = 5;
const OTP_LENGTH = 6;

/**
 * Phone OTP flow used for registration, login-by-OTP, password reset, and
 * phone (re-)verification. Codes are never stored in plaintext — only their
 * SHA-256 hash — so a database read alone cannot be used to impersonate a
 * user. Attempts are capped per-code to block brute-forcing a 6-digit space.
 */
export async function requestOtp(phone: string, purpose: OtpPurpose): Promise<void> {
  const code = generateNumericOtp(OTP_LENGTH);
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.phoneOtp.create({
    data: { phone, purpose, codeHash, expiresAt },
  });

  const provider = getSmsProvider();
  await provider.sendSms(
    phone,
    `DeliveryApp: your verification code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes. Do not share it.`,
  );
}

export async function verifyOtp(
  phone: string,
  purpose: OtpPurpose,
  code: string,
): Promise<{ otpId: string }> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw ApiError.badRequest("No pending verification code found. Request a new one.");
  }
  if (otp.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest("Verification code has expired. Request a new one.");
  }
  if (otp.attempts >= otp.maxAttempts) {
    throw ApiError.badRequest("Too many incorrect attempts. Request a new code.");
  }

  const codeHash = sha256Hex(code);
  if (codeHash !== otp.codeHash) {
    await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw ApiError.badRequest("Incorrect verification code.");
  }

  await prisma.phoneOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });

  return { otpId: otp.id };
}
