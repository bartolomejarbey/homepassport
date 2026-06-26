// lib/dev-bypass.ts — local-only "skip login" affordance.
//
// WHY: running the app locally without a real Supabase project leaves every
// protected route behind the login wall. This lets a developer click one button
// to enter the app with a deterministic fake session and browse the real UI.
// Data queries still go to Supabase and simply come back empty, so pages render
// their honest empty / onboarding states instead of real data.
//
// SAFETY: the bypass is HARD-DISABLED in production builds (`NODE_ENV` is
// "production" in `next build`/`next start` and on Vercel), so it can never
// weaken a real deployment — the cookie is ignored and the button never renders.

export const DEV_BYPASS_COOKIE = "dev_bypass";

// Only ever available outside a production build.
export const DEV_BYPASS_AVAILABLE = process.env.NODE_ENV !== "production";

// Deterministic fake session user. The id is a valid UUID so it slots into the
// same query shapes a real user id would; with no backend the queries just
// return nothing for it.
export const DEV_BYPASS_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "dev@localhost",
  app_metadata: { provider: "dev-bypass", providers: ["dev-bypass"] },
  user_metadata: { full_name: "Dev (bypass)" },
  created_at: "1970-01-01T00:00:00.000Z",
} as const;

// True when the bypass cookie is present AND we are not in production.
export function devBypassEnabled(cookieValue: string | undefined): boolean {
  return DEV_BYPASS_AVAILABLE && cookieValue === "1";
}

// A `fetch` stand-in used only while the bypass is active. Every Supabase call
// resolves INSTANTLY to an empty PostgREST result (empty body, row count 0)
// instead of hitting — and then having supabase-js retry against — a backend
// that isn't running. Selects come back `[]`, `.maybeSingle()` comes back null,
// and `{ count, head: true }` reads 0 from the Content-Range header. The net
// effect: protected pages render their honest empty states with no network wait.
export const devBypassFetch = (async () =>
  new Response("[]", {
    status: 200,
    headers: {
      "content-type": "application/json",
      // PostgREST count header — "<unit> <range>/<total>"; total 0 ⇒ count 0.
      "content-range": "*/0",
    },
  })) as unknown as typeof fetch;
