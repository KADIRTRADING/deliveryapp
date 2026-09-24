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
};

export default withNextIntl(nextConfig);
