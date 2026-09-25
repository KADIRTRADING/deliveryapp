import { describe, expect, it } from "vitest";
import { dateRangeQuerySchema, resolveDateRange } from "@/modules/analytics/schemas";

describe("dateRangeQuerySchema", () => {
  it("accepts an empty range (both bounds omitted)", () => {
    expect(() => dateRangeQuerySchema.parse({})).not.toThrow();
  });

  it("accepts a valid from/to range", () => {
    expect(() =>
      dateRangeQuerySchema.parse({
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-01-31T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects a range where `to` is before `from`", () => {
    expect(() =>
      dateRangeQuerySchema.parse({
        from: "2024-02-01T00:00:00.000Z",
        to: "2024-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a malformed date string", () => {
    expect(() => dateRangeQuerySchema.parse({ from: "not-a-date" })).toThrow();
  });
});

describe("resolveDateRange", () => {
  it("defaults `from` to the epoch and `to` to now when both are omitted", () => {
    const before = new Date();
    const { from, to } = resolveDateRange({});
    const after = new Date();

    expect(from.getTime()).toEqual(0);
    expect(to.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(to.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("uses the supplied bounds when both are present", () => {
    const { from, to } = resolveDateRange({
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-01-31T00:00:00.000Z",
    });
    expect(from.toISOString()).toEqual("2024-01-01T00:00:00.000Z");
    expect(to.toISOString()).toEqual("2024-01-31T00:00:00.000Z");
  });
});
