import "server-only";

// Tiny in-memory, per-user, fixed-window rate limiter.
//
// PURPOSE: a best-effort cost guard for the AI routes (`/api/ai/*`), which each
// trigger a paid provider call. It caps how many requests one authenticated
// user can fire in a short window so a buggy client (or a logged-in user holding
// down a button) cannot drive runaway inference cost or provider rate-limit
// bans. It is NOT a security control — auth + RLS remain the real boundary.
//
// IMPORTANT CAVEATS (intentional, documented):
//   - PER-INSTANCE only. The window lives in this Node process's memory, so on a
//     horizontally-scaled / serverless deployment each instance keeps its own
//     count and the effective global limit is (limit × instances). For a true
//     distributed limit, back this with Redis/Postgres later. For MVP + single
//     instance it meaningfully caps abuse; it never *under*-counts within an
//     instance, so it can only be more lenient than configured, never stricter.
//   - Resets on redeploy / cold start. Acceptable for a soft cost guard.
//   - Keyed by user id (the caller passes auth.uid()), never by IP, so it is not
//     spoofable by header and is fair per authenticated principal.
//
// The map is bounded by lazy sweeping of expired buckets on each call, so a
// stream of distinct users cannot grow it without bound across windows.

type Bucket = { count: number; resetAt: number };

// Module-level state. A single shared registry keyed by `${name}:${id}` so
// different routes can use independent limits without colliding.
const buckets = new Map<string, Bucket>();

// Opportunistic GC: drop expired buckets so the map stays small. Cheap (only
// runs a full sweep occasionally, gated by a time cursor) and bounded.
let lastSweep = 0;
function sweep(now: number) {
  // At most once per ~30s do a full pass; otherwise this would be O(n) per call.
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  /** True when the request is within the allowance and may proceed. */
  ok: boolean;
  /** Seconds until the window resets (for a Retry-After header). >= 1 when blocked. */
  retryAfter: number;
  /** Requests still allowed in the current window (0 when blocked). */
  remaining: number;
}

/**
 * Account one hit for `id` under bucket `name` and report whether it is allowed.
 *
 * Fixed-window: the first hit opens a window of `windowMs`; up to `limit` hits
 * are allowed within it; the (limit+1)-th is rejected until the window rolls
 * over. Defaults (30 requests / 60s) are generous for legitimate interactive
 * use of a single AI feature while still bounding a hot loop.
 */
export function rateLimit(
  name: string,
  id: string,
  limit = 30,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const key = `${name}:${id}`;
  const existing = buckets.get(key);

  // No live window, or the previous one has elapsed → start a fresh window.
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, remaining: Math.max(0, limit - 1) };
  }

  // Within an open window.
  if (existing.count < limit) {
    existing.count += 1;
    return { ok: true, retryAfter: 0, remaining: Math.max(0, limit - existing.count) };
  }

  // Over the limit for this window.
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return { ok: false, retryAfter, remaining: 0 };
}

// Test-only helper to reset state between unit tests. Not used by app code.
export function __resetRateLimit() {
  buckets.clear();
  lastSweep = 0;
}
