import "server-only";
import { z } from "zod";

/**
 * Runtime environment validation (server-only).
 *
 * WHY LAZY: `next build` runs with envs frequently ABSENT (CI, Vercel build step
 * before Project Settings are wired). Validating at module-import time would fail
 * the build the moment any file transitively imports this module. So we DO NOT
 * validate at module top level — `env` is a lazy Proxy that validates on first
 * property access (i.e. at request time, on the server). A misconfigured deploy
 * therefore fails fast with a readable message on the FIRST request that needs a
 * key, never silently with `undefined!` blowing up deep inside the Supabase/AI SDK.
 *
 * USAGE:
 *   import { env } from "@/lib/env";
 *   createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, …)
 *
 * To force-validate everything eagerly at a known point (e.g. a healthcheck route
 * or a server-init module), call `assertEnv()`.
 */

// ---- schema -----------------------------------------------------------------
// Required vars throw if missing/empty. Optional vars are typed `string | undefined`.
// NOTE: NEXT_PUBLIC_* must also be present at BUILD time for client bundles; this
// schema governs the SERVER runtime read. Keep this list in sync with .env.example.
const schema = z.object({
  // Supabase (EU region project)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("musí být platná URL / must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Server-only — never exposed to the client.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // AI provider (multimodal: doc extraction, vision, RAG)
  OPENAI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),

  // Optional — features degrade gracefully when unset.
  AI_PROVIDER: z.string().min(1).optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // Transactional email. UNSET → email sending is a safe no-op (see lib/email).
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  // Public origins. Used for shareable handover links / sitemap / robots.
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

// Human-readable, bilingual failure. Lists exactly which vars are wrong and why,
// never echoing any value (keys/secrets must not leak into logs).
function formatError(error: z.ZodError): string {
  const lines = error.issues.map((i) => {
    const key = i.path.join(".") || "(root)";
    return `  • ${key}: ${i.message}`;
  });
  return [
    "",
    "════════════════════════════════════════════════════════════════════",
    " Chybná konfigurace prostředí / Invalid environment configuration",
    "════════════════════════════════════════════════════════════════════",
    " Tyto proměnné prostředí chybí nebo jsou neplatné:",
    " The following environment variables are missing or invalid:",
    "",
    ...lines,
    "",
    " Doplň je (viz .env.example) — v lokále do .env.local, v produkci do",
    " Vercel → Project → Settings → Environment Variables.",
    " Set them (see .env.example): .env.local locally, or in Vercel Project",
    " Settings → Environment Variables in production.",
    "════════════════════════════════════════════════════════════════════",
    "",
  ].join("\n");
}

let cached: Env | null = null;

/**
 * Parse + cache the environment. Throws a single readable bilingual error listing
 * every missing/invalid var. Idempotent — parses at most once per server process.
 */
export function assertEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatError(parsed.error));
  }
  cached = parsed.data;
  return cached;
}

/**
 * Typed, validated environment. Lazy: validation runs on first property access,
 * NOT at import — so `next build` with absent envs stays green. At runtime the
 * first read of any var triggers a full validation, so a bad deploy fails fast.
 */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string) {
    return assertEnv()[prop as keyof Env];
  },
  has(_t, prop: string) {
    return prop in assertEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(assertEnv());
  },
  getOwnPropertyDescriptor(_t, prop) {
    return Object.getOwnPropertyDescriptor(assertEnv(), prop);
  },
});
