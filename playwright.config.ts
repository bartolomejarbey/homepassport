// playwright.config.ts — end-to-end browser tests (separate from the Vitest unit
// suite in tests/). These run against the *public* surface of the app and must
// pass WITHOUT Supabase/AI credentials, so the suite only touches pages that
// render with the placeholder env in .env.local (landing, auth screens, the
// public pilot form, a bad handover token, and the unauth redirect).
//
// Browser binary: this environment ships a pre-installed Chromium under
// PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers). Its build number can differ from
// the one the installed @playwright/test driver expects, so we resolve the real
// `chrome` binary on disk and pin `executablePath` to it instead of relying on
// chromium.executablePath(). Never run `playwright install` here.
import { defineConfig, devices } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const PORT = 3010;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Find the pre-installed Chromium executable, tolerating browser-build bumps.
// Layout is /opt/pw-browsers/chromium-<rev>/chrome-linux{,64}/chrome. We prefer
// the full browser over the headless shell so headed debugging also works.
function resolveChromiumPath(): string | undefined {
  // Honor an explicit override first (useful in CI / other machines).
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override && existsSync(override)) return override;

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;

  const candidates: string[] = [];
  for (const entry of readdirSync(root)) {
    // Skip the headless_shell builds when a full chromium build is present.
    if (!entry.startsWith("chromium-")) continue;
    for (const sub of ["chrome-linux", "chrome-linux64"]) {
      candidates.push(path.join(root, entry, sub, "chrome"));
    }
  }
  // Fall back to the headless shell if that is all we have.
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith("chromium_headless_shell-")) continue;
    for (const sub of ["chrome-linux", "chrome-linux64"]) {
      candidates.push(path.join(root, entry, sub, "headless_shell"));
    }
  }
  return candidates.find((p) => existsSync(p));
}

const executablePath = resolveChromiumPath();

export default defineConfig({
  testDir: "./e2e",
  // Fully parallel across files; deterministic on CI.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // A real, branded locale matters: the UI is Czech and assertions match
    // Czech strings with diacritics.
    locale: "cs-CZ",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Pin to the on-disk binary; the driver's expected build may not exist.
        launchOptions: executablePath ? { executablePath } : undefined,
      },
    },
  ],

  // Boot the Next.js dev server on the e2e port. Reuse an already-running one so
  // local iteration is fast; CI starts a fresh server.
  //
  // ENV: lib/env.ts validates the WHOLE env schema on first access (all-or-
  // nothing), so a server-rendered page (e.g. /pro/poptavka, whose layout builds
  // a Supabase client) throws a 500 the moment ANY required var is missing —
  // including OPENAI_API_KEY, which .env.local does not set. These e2e tests must
  // run WITHOUT real Supabase/AI credentials, so we inject deterministic
  // PLACEHOLDER values for every required var here. They satisfy the schema
  // (valid URL / non-empty string) without contacting any real service: the
  // public pages under test never make an authenticated Supabase or AI call, and
  // an unauthenticated getUser() against a non-routable host simply yields no
  // session (which is exactly the logged-out state we assert). Process env takes
  // precedence over .env.local in Next, so this is stable regardless of the
  // machine's .env.local or shell.
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "placeholder-service-key",
      OPENAI_API_KEY: "placeholder-openai-key",
      AI_MODEL: "gpt-5.5",
      NEXT_PUBLIC_APP_URL: BASE_URL,
    },
  },
});
