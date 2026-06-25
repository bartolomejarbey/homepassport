import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// SERVICE ROLE — server-only. Never import from a client component.
// Reads `env` (validated lazily at call time): a misconfigured deploy fails fast
// with a readable bilingual error instead of passing `undefined!` to the SDK.
export function createAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
