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
      // `server-only` is a build-time marker Next aliases away when bundling for
      // the server; it has no standalone entry to resolve under Node/vitest. Map
      // it to Next's own empty stub so pure server-side utils that import it (the
      // rate-limit cost guard) can be unit-tested. This mirrors what the Next
      // build does and changes no runtime behaviour.
      "server-only": fileURLToPath(
        new URL(
          "./node_modules/next/dist/compiled/server-only/empty.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "**/*.test.ts"],
    // e2e/ holds Playwright specs (*.spec.ts), a separate runner — keep Vitest out.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
});
