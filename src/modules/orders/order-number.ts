import { randomInt } from "node:crypto";

/**
 * Human-friendly, sortable order number: YYMMDD-XXXXXX (date prefix + a
 * random 6-digit suffix). The date prefix makes order numbers roughly
 * chronologically sortable at a glance for support/restaurant staff without
 * leaking a sequential counter (which would reveal total order volume).
 * Uniqueness is enforced by the database's `@unique` constraint on
 * `Order.orderNumber`; on the astronomically unlikely event of a collision,
 * the caller should retry with a freshly generated number.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const suffix = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return `${yy}${mm}${dd}-${suffix}`;
}
