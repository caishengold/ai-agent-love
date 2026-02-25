import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    fileParallelism: false,
    sequence: { shuffle: false },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**", "middleware.ts"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
