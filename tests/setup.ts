// Global test setup. Ensures NODE_ENV is "test" so src/lib/env.ts uses its
// relaxed test-mode defaults (see env.ts) rather than requiring every
// provider credential to be present.
process.env.NODE_ENV = "test";
