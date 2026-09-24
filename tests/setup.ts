// Global test setup. Ensures NODE_ENV is "test" so src/lib/env.ts uses its
// relaxed test-mode defaults (see env.ts) rather than requiring every
// provider credential to be present.
//
// TypeScript types `process.env.NODE_ENV` as a readonly property (via
// @types/node), so we go through `Object.defineProperty` rather than direct
// assignment. Vitest also sets NODE_ENV=test automatically, but we pin it
// explicitly here so this module's intent is self-documenting and does not
// silently depend on the test runner's own environment defaults.
Object.defineProperty(process.env, "NODE_ENV", {
  value: "test",
  configurable: true,
  enumerable: true,
  writable: true,
});
