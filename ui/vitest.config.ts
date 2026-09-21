import { defineConfig } from "vitest/config";

// Unit/DOM tests for the UI layer (jsdom; CSS vars + React rendering).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Real timers only — no fake-timer flakiness in appearance tests.
    restoreMocks: true,
  },
});
