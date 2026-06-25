import "server-only";
import { NextResponse } from "next/server";
import { rateLimit } from "./rate-limit";

// Small shared helpers for hardening API route handlers, so every route returns
// a predictable JSON envelope (never an HTML error page) and applies the same
// input-size and rate-limit guards. None of this changes a route's SUCCESS
// shape — success responses are still produced by each route as before. These
// helpers only standardise the failure paths and the cheap pre-checks.

// Canonical JSON error. `code` is a stable, machine-readable string the client
// MAY branch on; `error` stays the human (Czech) message the existing clients
// already render from `body.error`. Extra fields (e.g. retryAfter) merge in.
export function jsonError(
  message: string,
  status: number,
  code: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

// Hard ceiling on the request body we will buffer before validation. The AI
// routes carry only a tiny JSON object (a UUID / a short query / a storage
// path), so anything large is either a mistake or abuse — reject it up front via
// the Content-Length header instead of buffering it into memory. The actual
// binary the AI sees is fetched server-side from Storage, never posted here.
const MAX_JSON_BYTES = 16 * 1024; // 16 KB — generous for a small JSON object

// Reject an over-large body using the declared Content-Length. Returns a JSON
// 413 response when over the cap, otherwise null (proceed). Best-effort: a
// missing/garbled header is allowed through (Zod's length bounds are the real
// backstop), but a present, honest length lets us bail before reading the body.
export function rejectIfTooLarge(
  request: Request,
  max = MAX_JSON_BYTES,
): NextResponse | null {
  const len = Number(request.headers.get("content-length"));
  if (Number.isFinite(len) && len > max) {
    return jsonError("Požadavek je příliš velký.", 413, "payload_too_large");
  }
  return null;
}

// Parse a JSON body without ever throwing. Returns `undefined` on any failure
// (bad JSON, wrong content-type, empty body); callers then run Zod and emit a
// uniform 400. Mirrors the existing per-route try/catch around request.json(),
// centralised so no route can accidentally let a parse error escape as a 500.
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// Apply the per-user AI cost guard and, when exceeded, return a ready-to-send
// 429 JSON response with Retry-After. Returns null when the caller may proceed.
// `bucket` namespaces the limit per route so one AI feature can't exhaust
// another's allowance.
export function rateLimitGuard(
  bucket: string,
  userId: string,
  limit?: number,
  windowMs?: number,
): NextResponse | null {
  const rl = rateLimit(bucket, userId, limit, windowMs);
  if (rl.ok) return null;
  return jsonError(
    "Příliš mnoho požadavků. Zkuste to prosím za chvíli.",
    429,
    "rate_limited",
    { retryAfter: rl.retryAfter },
  );
}
