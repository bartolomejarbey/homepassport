import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import {
  DEV_BYPASS_COOKIE,
  DEV_BYPASS_USER,
  devBypassEnabled,
  devBypassFetch,
} from "@/lib/dev-bypass";

// cookies() is async in this Next.js — always await it.
// `env` validates lazily at request time (not at import), so `next build` with
// absent envs stays green while a misconfigured runtime fails fast and readably.
export async function createClient() {
  const cookieStore = await cookies();
  const bypass = devBypassEnabled(cookieStore.get(DEV_BYPASS_COOKIE)?.value);

  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — safe to ignore when middleware refreshes sessions
          }
        },
      },
      // Local-only login bypass (see lib/dev-bypass.ts): short-circuit every
      // backend call to an instant empty result so the app is browsable with no
      // Supabase running, and supabase-js never burns ~7s retrying a dead host.
      ...(bypass ? { global: { fetch: devBypassFetch } } : {}),
    },
  );

  // ...and present a deterministic fake session so every `sb.auth.getUser()`
  // call site (layouts, pages, actions) sees a logged-in user.
  if (bypass) {
    client.auth.getUser = (async () => ({
      data: { user: DEV_BYPASS_USER },
      error: null,
    })) as unknown as typeof client.auth.getUser;
  }

  return client;
}
