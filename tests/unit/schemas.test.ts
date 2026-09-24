import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema, uzbekPhoneSchema } from "@/modules/auth/schemas";

describe("uzbekPhoneSchema", () => {
  it("accepts valid Uzbekistan phone numbers", () => {
    expect(uzbekPhoneSchema.parse("+998901234567")).toEqual("+998901234567");
  });

  it("rejects numbers without the country code", () => {
    expect(() => uzbekPhoneSchema.parse("901234567")).toThrow();
  });

  it("rejects numbers with the wrong digit count", () => {
    expect(() => uzbekPhoneSchema.parse("+99890123")).toThrow();
  });

  it("rejects non-Uzbekistan country codes", () => {
    expect(() => uzbekPhoneSchema.parse("+79991234567")).toThrow();
  });
});

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.parse({
      phone: "+998901234567",
      password: "StrongPass1",
      firstName: "Aziz",
    });
    expect(result.locale).toEqual("UZ");
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(() =>
      registerSchema.parse({
        phone: "+998901234567",
        password: "short",
        firstName: "Aziz",
      }),
    ).toThrow();
  });

  it("rejects an empty first name", () => {
    expect(() =>
      registerSchema.parse({
        phone: "+998901234567",
        password: "StrongPass1",
        firstName: "",
      }),
    ).toThrow();
  });
});

describe("loginSchema", () => {
  it("accepts a valid login payload", () => {
    expect(() =>
      loginSchema.parse({ phone: "+998901234567", password: "anything" }),
    ).not.toThrow();
  });
});
