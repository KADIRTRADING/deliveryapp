import { describe, expect, it } from "vitest";
import { isBranchCurrentlyOpen } from "@/modules/restaurants/restaurants.service";

describe("isBranchCurrentlyOpen", () => {
  const weeklySchedule = {
    mon: [["09:00", "22:00"]],
    tue: [["09:00", "22:00"]],
    wed: [["09:00", "22:00"]],
    thu: [["09:00", "22:00"]],
    fri: [["09:00", "23:00"]],
    sat: [["10:00", "23:00"]],
    sun: [],
  };

  it("returns true when the current time falls within today's schedule", () => {
    // Wednesday 2024-01-03 at 12:00 local time.
    const wednesdayNoon = new Date(2024, 0, 3, 12, 0);
    expect(isBranchCurrentlyOpen(weeklySchedule, null, wednesdayNoon)).toBe(true);
  });

  it("returns false when the current time is outside today's schedule", () => {
    const wednesdayLateNight = new Date(2024, 0, 3, 23, 30);
    expect(isBranchCurrentlyOpen(weeklySchedule, null, wednesdayLateNight)).toBe(false);
  });

  it("returns false on a day with no schedule entries (closed all day)", () => {
    const sundayNoon = new Date(2024, 0, 7, 12, 0);
    expect(isBranchCurrentlyOpen(weeklySchedule, null, sundayNoon)).toBe(false);
  });

  it("returns false when temporarily closed, even during normal open hours", () => {
    const wednesdayNoon = new Date(2024, 0, 3, 12, 0);
    const closedUntil = new Date(2024, 0, 5); // Friday
    expect(isBranchCurrentlyOpen(weeklySchedule, closedUntil, wednesdayNoon)).toBe(false);
  });

  it("resumes normal hours once the temporary closure window has passed", () => {
    const wednesdayNoon = new Date(2024, 0, 3, 12, 0);
    const closedUntilYesterday = new Date(2024, 0, 2);
    expect(isBranchCurrentlyOpen(weeklySchedule, closedUntilYesterday, wednesdayNoon)).toBe(true);
  });
});
