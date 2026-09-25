"use client";

/**
 * Browser-side fetch wrapper for calling this app's own /api/** routes.
 *
 * Handles the two pieces of protocol plumbing every mutating request needs
 * (see src/middleware.ts):
 * 1. Reads the `dapp_csrf` cookie (readable by JS — it's deliberately not
 *    httpOnly) and echoes it back as the `x-csrf-token` header on every
 *    POST/PUT/PATCH/DELETE to /api/**.
 * 2. Always sends `credentials: "include"` so the httpOnly `dapp_session`
 *    cookie set by login/register is included on every request.
 *
 * The CSRF cookie is only ever issued by middleware on a response to an
 * `/api/*` request, so a plain GET to any API route (e.g. /api/health) is
 * enough to bootstrap it before the very first mutating request.
 */

const CSRF_COOKIE_NAME = "dapp_csrf";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Core request helper. `path` must start with `/api/`. Throws ApiRequestError
 * on any non-2xx response, parsed from the uniform { error: { code,
 * message, details } } shape produced by src/lib/api-error.ts.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const url = buildUrl(path, options.query);

  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  if (MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const errBody = data as
      { error?: { code?: string; message?: string; details?: unknown } } | undefined;
    throw new ApiRequestError(
      response.status,
      errBody?.error?.code ?? "UNKNOWN_ERROR",
      errBody?.error?.message ?? "Something went wrong. Please try again.",
      errBody?.error?.details,
    );
  }

  return data as T;
}

/**
 * Ensure the CSRF cookie has been issued before the first mutating request
 * of a page session (e.g. before submitting a login form on a page that
 * itself never triggered an /api/* GET). Safe to call redundantly — the
 * middleware only sets the cookie if it isn't already present.
 */
export async function ensureCsrfCookie(): Promise<void> {
  if (readCookie(CSRF_COOKIE_NAME)) return;
  try {
    await fetch("/api/health", { credentials: "include" });
  } catch {
    // Best-effort — if this fails, the first mutating request's CSRF
    // header will simply be empty and the server will reject it with a
    // clear 403, which the UI already surfaces as an error.
  }
}

export const api = {
  get: <T>(path: string, query?: ApiFetchOptions["query"]) =>
    apiFetch<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "DELETE", body }),
};
