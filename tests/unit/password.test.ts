import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, isPasswordStrongEnough } from "@/lib/password";

describe("password hashing", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword("Sup3rSecret!", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    await expect(verifyPassword("WrongPassword!", hash)).resolves.toBe(false);
  });

  it("produces a different hash for the same password each time (random salt)", async () => {
    const hash1 = await hashPassword("Sup3rSecret!");
    const hash2 = await hashPassword("Sup3rSecret!");
    expect(hash1).not.toEqual(hash2);
  });

  it("rejects malformed stored hashes gracefully instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-valid-hash")).resolves.toBe(false);
  });

  it("enforces minimum password length", () => {
    expect(isPasswordStrongEnough("short")).toBe(false);
    expect(isPasswordStrongEnough("longenough1")).toBe(true);
  });
});
