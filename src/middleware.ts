import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { generateOpaqueToken } from "@/lib/crypto";

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * Why this approach: our session cookie is SameSite=Lax + httpOnly, which
 * already blocks the cookie from being attached to most cross-site
 * subrequests, but Lax still allows top-level cross-site navigations (GET)
 * to carry it, and defense-in-depth is required for state-changing requests.
 * On every response we ensure a non-httpOnly `dapp_csrf` cookie is set; the
 * client is expected to read it and echo its value back in an
 * `x-csrf-token` header on POST/PUT/PATCH/DELETE requests. The middleware
 * rejects state-changing requests where the header doesn't match the
 * cookie.
 *
 * Webhook endpoints (payment provider callbacks) are exempt from this check
 * — they are authenticated instead via provider-specific signature
 * verification (see payments module), since an external provider cannot
 * participate in the double-submit cookie handshake.
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT_PATH_PREFIXES = ["/api/payments/webhooks/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isExempt = EXEMPT_PATH_PREFIXES.some((p) => pathname.startsWith(p));

  let response: NextResponse;

  if (isApiRoute && MUTATING_METHODS.has(req.method) && !isExempt) {
    const cookieToken = req.cookies.get(env.CSRF_COOKIE_NAME)?.value;
    const headerToken = req.headers.get("x-csrf-token");

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      response = NextResponse.json(
        { error: { code: "CSRF_VALIDATION_FAILED", message: "Invalid or missing CSRF token." } },
        { status: 403 },
      );
      ensureCsrfCookie(req, response);
      return response;
    }
  }

  response = NextResponse.next();
  ensureCsrfCookie(req, response);
  return response;
}

function ensureCsrfCookie(req: NextRequest, response: NextResponse) {
  if (!req.cookies.get(env.CSRF_COOKIE_NAME)) {
    response.cookies.set(env.CSRF_COOKIE_NAME, generateOpaqueToken(24), {
      httpOnly: false, // must be readable by client JS to echo back in the header
      secure: env.FORCE_SECURE_COOKIES,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

export const config = {
  matcher: ["/api/:path*"],
  // Force the Node.js runtime (not Edge): this middleware depends on
  // node:crypto (via generateOpaqueToken) and on env.ts's Node-oriented
  // validation, neither of which should be assumed to work in the Edge
  // runtime's restricted API surface.
  runtime: "nodejs",
};
