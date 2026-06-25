// Pure JSON-object parse with a safe fallback, factored out of the model call in
// ./index.ts so it can be unit-tested without the `server-only` / OpenAI deps.
//
// CONTRACT (must stay 1:1 with how index.ts consumed `JSON.parse(... ?? "{}")`):
//   - missing content (null/undefined/"") parses the literal "{}" -> {}
//   - malformed / truncated model output never throws -> {} (a safe empty draft)
//   - otherwise returns whatever JSON.parse yields (object, and — as before —
//     also arrays/primitives if the model returned those verbatim).
//
// The {} fallback is load-bearing: every caller treats a parse miss as "no
// fields", so a flaky/over-truncated model degrades to an empty draft the user
// can retry, never a 500.
export function parseJsonObject(raw: string | null | undefined): unknown {
  try {
    return JSON.parse(raw ?? "{}");
  } catch {
    return {};
  }
}
