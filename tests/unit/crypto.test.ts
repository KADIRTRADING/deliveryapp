import { describe, expect, it } from "vitest";
import { generateOpaqueToken, sha256Hex, generateNumericOtp } from "@/lib/crypto";

describe("crypto helpers", () => {
  it("generates unique opaque tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("produces a stable sha256 hex digest", () => {
    expect(sha256Hex("hello")).toEqual(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("generates numeric OTPs of the requested length", () => {
    const otp = generateNumericOtp(6);
    expect(otp).toMatch(/^\d{6}$/);
  });
});
