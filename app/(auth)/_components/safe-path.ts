// Open-redirect guard for the auth flows.
//
// A naive `value.startsWith("/")` check is NOT enough: browsers treat
// protocol-relative URLs like "//evil.com" or "/\evil.com" as absolute,
// so an attacker could craft ?next=//evil.com and bounce the user off-site
// after login. We only ever allow a single-slash, same-origin path.

// Auth routes are never valid post-login destinations. Bouncing a freshly
// authenticated user back to /prihlaseni or /registrace (which themselves
// redirect authenticated users to safeNextPath(next)) would create an
// infinite redirect loop, so these are folded into the fallback.
const AUTH_PREFIXES = ["/prihlaseni", "/registrace", "/zapomenute-heslo", "/nove-heslo", "/auth"];

export function safeNextPath(value: string | null | undefined, fallback = "/prehled"): string {
  if (!value) return fallback;
  // Must start with exactly one "/" and not be protocol-relative ("//" or "/\").
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.startsWith("/\\")) return fallback;
  // Reject anything with a scheme or control characters that could be abused.
  if (/[\x00-\x1f]/.test(value)) return fallback;
  // Never redirect back into the auth flow itself — prevents login loops.
  const path = value.split(/[?#]/, 1)[0];
  if (AUTH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return value;
}
