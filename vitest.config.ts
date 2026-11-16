import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "lib/gia/*.test.mjs"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dir, "."),
    },
  },
});
