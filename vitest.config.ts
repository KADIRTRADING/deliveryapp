import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The `server-only` package throws at import time unless the
      // "react-server" condition is set, which Vitest does not set by
      // default (it isn't running inside Next.js's RSC bundler). Our
      // service modules import "server-only" purely as a lint-time guard
      // against accidental client bundling, which has no meaning in a
      // Vitest unit test run — so we alias it to a no-op here.
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
