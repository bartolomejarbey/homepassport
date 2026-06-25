// Open-redirect guard for the auth flows.
//
// A naive `value.startsWith("/")` check is NOT enough: browsers treat
// protocol-relative URLs like "//evil.com" or "/\evil.com" as absolute,
// so an attacker could craft ?next=//evil.com and bounce the user off-site
// after login. We only ever allow a single-slash, same-origin path.
export function safeNextPath(value: string | null | undefined, fallback = "/prehled"): string {
  if (!value) return fallback;
  // Must start with exactly one "/" and not be protocol-relative ("//" or "/\").
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.startsWith("/\\")) return fallback;
  // Reject anything with a scheme or control characters that could be abused.
  if (/[\x00-\x1f]/.test(value)) return fallback;
  return value;
}
