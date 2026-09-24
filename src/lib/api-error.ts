import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Typed application error with an HTTP status and a machine-readable code.
 * Route handlers should throw this (or a subclass) rather than returning ad
 * hoc error shapes, so error responses are consistent across the whole API
 * surface and never leak internal details (stack traces, SQL, file paths).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = "Bad request", details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "You do not have permission to perform this action") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Resource not found") {
    return new ApiError(404, "NOT_FOUND", message);
  }
  static conflict(message = "Conflict") {
    return new ApiError(409, "CONFLICT", message);
  }
  static tooManyRequests(message = "Too many requests") {
    return new ApiError(429, "TOO_MANY_REQUESTS", message);
  }
  static internal(message = "Internal server error") {
    return new ApiError(500, "INTERNAL_ERROR", message);
  }
}

/**
 * Uniform handler wrapper for Route Handlers. Ensures:
 * - Zod validation errors become 400s with field-level details.
 * - ApiError instances map to their declared status/code.
 * - Anything unexpected becomes an opaque 500 (never leaks internals to
 *   clients), while still being logged server-side for diagnosis.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: err.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  // eslint-disable-next-line no-console
  console.error("[api] Unhandled error:", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}
