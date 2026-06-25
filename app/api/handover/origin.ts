// Resolve the PUBLIC origin for building shareable handover links.
//
// The handover invite link is the headline B2B deliverable: the developer copies
// it and emails it to the buyer. Deriving it from `new URL(request.url).origin`
// breaks behind a reverse proxy / load balancer, where request.url often carries
// the internal origin (e.g. http://localhost:3000) instead of the public host.
//
// Preference order:
//   1) NEXT_PUBLIC_APP_URL          — explicit, correct in every environment
//   2) x-forwarded-proto/-host      — what the edge actually served (proxy-aware)
//   3) new URL(request.url).origin  — last-resort fallback for plain local dev
import "server-only";

function clean(url: string): string {
  return url.replace(/\/+$/, "");
}

export function publicOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return clean(new URL(configured).origin);
    } catch {
      // Misconfigured env — fall through to header/request derivation.
    }
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return clean(`${proto}://${host}`);
  }

  return clean(new URL(request.url).origin);
}
