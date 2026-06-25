import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node environment is correct here: every unit under test is pure logic
// (revize engine, the open-redirect guard, the cn() class merger) with no DOM.
// The "@/..." alias mirrors tsconfig.json `paths` so "@/lib/..." imports resolve
// to the project root the same way Next.js resolves them at build time.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
