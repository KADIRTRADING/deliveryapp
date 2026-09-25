import { describe, expect, it } from "vitest";
import {
  isValidTransition,
  assertValidTransition,
  roleCanTransitionTo,
  InvalidTransitionError,
  CUSTOMER_CANCELLABLE_STATUSES,
} from "@/modules/orders/status-machine";

describe("order status machine", () => {
  it("allows the documented happy-path cash order flow", () => {
    const path = [
      "PENDING",
      "ACCEPTED",
      "PREPARING",
      "READY_FOR_PICKUP",
      "COURIER_ASSIGNED",
      "PICKED_UP",
      "ON_THE_WAY",
      "DELIVERED",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(isValidTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("allows the documented online-payment order flow", () => {
    expect(isValidTransition("PAYMENT_PENDING", "PAID")).toBe(true);
    expect(isValidTransition("PAID", "ACCEPTED")).toBe(true);
  });

  it("rejects skipping states in the fulfillment pipeline", () => {
    expect(isValidTransition("ACCEPTED", "READY_FOR_PICKUP")).toBe(false);
    expect(isValidTransition("PENDING", "DELIVERED")).toBe(false);
    expect(isValidTransition("PREPARING", "ON_THE_WAY")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(isValidTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(isValidTransition("REFUNDED", "PAID")).toBe(false);
  });

  it("allows cancellation from every pre-fulfillment status", () => {
    expect(isValidTransition("PENDING", "CANCELLED")).toBe(true);
    expect(isValidTransition("PAYMENT_PENDING", "CANCELLED")).toBe(true);
    expect(isValidTransition("PAID", "CANCELLED")).toBe(true);
    expect(isValidTransition("ACCEPTED", "CANCELLED")).toBe(true);
    expect(isValidTransition("PREPARING", "CANCELLED")).toBe(true);
  });

  it("disallows cancellation once a courier has picked up the order", () => {
    expect(isValidTransition("COURIER_ASSIGNED", "CANCELLED")).toBe(false);
    expect(isValidTransition("PICKED_UP", "CANCELLED")).toBe(false);
    expect(isValidTransition("ON_THE_WAY", "CANCELLED")).toBe(false);
  });

  it("allows refunding a cancelled order", () => {
    expect(isValidTransition("CANCELLED", "REFUNDED")).toBe(true);
  });

  it("throws a descriptive error for an invalid transition", () => {
    expect(() => assertValidTransition("DELIVERED", "PENDING")).toThrow(InvalidTransitionError);
  });

  it("does not throw for a valid transition", () => {
    expect(() => assertValidTransition("PENDING", "ACCEPTED")).not.toThrow();
  });

  it("restricts fulfillment-stage transitions to restaurant staff/owner", () => {
    expect(roleCanTransitionTo("RESTAURANT_STAFF", "PREPARING")).toBe(true);
    expect(roleCanTransitionTo("COURIER", "PREPARING")).toBe(false);
  });

  it("restricts delivery-stage transitions to couriers", () => {
    expect(roleCanTransitionTo("COURIER", "ON_THE_WAY")).toBe(true);
    expect(roleCanTransitionTo("RESTAURANT_STAFF", "ON_THE_WAY")).toBe(false);
  });

  it("lets customers cancel only pre-acceptance-adjacent statuses", () => {
    expect(CUSTOMER_CANCELLABLE_STATUSES).toContain("PENDING");
    expect(CUSTOMER_CANCELLABLE_STATUSES).toContain("ACCEPTED");
    expect(CUSTOMER_CANCELLABLE_STATUSES).not.toContain("PREPARING");
  });
});
