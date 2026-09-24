import { z } from "zod";

/**
 * Uzbekistan phone numbers: E.164 format, +998 followed by 9 digits, e.g.
 * +998901234567. Validated strictly server-side — never trust client
 * formatting.
 */
export const uzbekPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+998\d{9}$/, "Phone number must be in the format +998XXXXXXXXX");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

export const registerSchema = z.object({
  phone: uzbekPhoneSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100).optional(),
  locale: z.enum(["UZ", "RU", "EN"]).default("UZ"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  phone: uzbekPhoneSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const requestOtpSchema = z.object({
  phone: uzbekPhoneSchema,
  purpose: z.enum(["REGISTER", "LOGIN", "RESET_PASSWORD", "VERIFY_PHONE", "CHANGE_PHONE"]),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: uzbekPhoneSchema,
  purpose: z.enum(["REGISTER", "LOGIN", "RESET_PASSWORD", "VERIFY_PHONE", "CHANGE_PHONE"]),
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Invalid verification code"),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const requestPasswordResetSchema = z.object({
  phone: uzbekPhoneSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  locale: z.enum(["UZ", "RU", "EN"]).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
