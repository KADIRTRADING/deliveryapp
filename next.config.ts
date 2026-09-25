import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces the minimal .next/standalone server bundle consumed by the
  // production Dockerfile stage, so the runtime image doesn't need the full
  // node_modules tree or the Next.js CLI.
  output: "standalone",
  // Images are served through our own StorageProvider abstraction (S3 / MinIO),
  // so remote patterns are driven by env-configured public endpoints only.
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  // Never leak server-only secrets to the client bundle. Only NEXT_PUBLIC_*
  // variables are ever exposed by Next.js; this is asserted again in src/lib/env.ts.
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  // Defense-in-depth HTTP security headers, applied to every response.
  // These are independent of (and in addition to) the CSRF/session/RBAC
  // controls implemented in src/middleware.ts and the auth/RBAC modules.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevent this app from being framed by another origin
          // (clickjacking protection).
          { key: "X-Frame-Options", value: "DENY" },
          // Stop browsers from MIME-sniffing responses away from their
          // declared Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Never leak the full referring URL (which may contain tokens in
          // query strings) to third-party destinations.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable powerful browser features this app never needs.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
