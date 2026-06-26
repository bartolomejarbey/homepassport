// proxy.ts — Next.js 16 renamed `middleware` to `proxy` (same file convention,
// project root). Refreshes the Supabase session on every request and guards the
// app routes before they render.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { DEV_BYPASS_COOKIE, devBypassEnabled } from "@/lib/dev-bypass";

// Routes that require an authenticated user. Matched by prefix.
const PROTECTED_PREFIXES = [
  "/prehled",
  "/nemovitost",
  "/dokumenty",
  "/majetek",
  "/pripominky",
  "/hledat",
  "/pro",
];

// Public carve-outs that sit UNDER a protected prefix and must stay open.
// /pro/poptavka is the B2B sales / pilot-request page — prospective firms reach
// it before they have an account, so it must not be forced through login. (The
// real console gate lives in app/(pro)/pro/(console)/layout.tsx.)
const PUBLIC_EXCEPTIONS = ["/pro/poptavka"];

export async function proxy(request: NextRequest) {
  // Mutable response we can attach refreshed auth cookies to.
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Resolve the signed-in user. If Supabase isn't configured yet (e.g. a fresh
  // deploy whose env vars aren't set), or the auth call fails transiently, do NOT
  // 500 the entire site from middleware — degrade to "logged out". Public pages
  // (landing, login) keep rendering; protected pages fall through to the login
  // redirect below. Once the env vars are present this path is identical to before.
  let user = null;
  if (supabaseUrl && supabaseAnon) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnon, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            // Write refreshed cookies back onto both the request and the response.
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      });

      // IMPORTANT: getUser() refreshes the session and must run before any redirect.
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      // Misconfigured/unreachable Supabase — treat as logged out instead of 500.
      user = null;
    }
  }

  const { pathname } = request.nextUrl;
  const isPublicException = PUBLIC_EXCEPTIONS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isProtected =
    !isPublicException &&
    PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

  // Local-only login bypass (see lib/dev-bypass.ts): when the dev cookie is set
  // and we're not in production, let protected routes through without a session.
  const devBypass = devBypassEnabled(request.cookies.get(DEV_BYPASS_COOKIE)?.value);

  if (isProtected && !user && !devBypass) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/prihlaseni";
    // Preserve the originally requested path (including its query string) so we
    // can bounce the user back exactly where they were headed after login.
    redirectUrl.search = "";
    redirectUrl.searchParams.set(
      "next",
      pathname + (request.nextUrl.search || ""),
    );
    const redirect = NextResponse.redirect(redirectUrl);
    // Carry over any auth cookies getUser() refreshed onto `response`; a brand-new
    // redirect response would otherwise drop a freshly rotated session cookie.
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  return response;
}

export const config = {
  // Run on all paths EXCEPT:
  //  • static assets / image optimizer / metadata files,
  //  • /api/* and /auth/* route handlers — none of these are protected pages, and
  //    /auth/callback runs its OWN session exchange, so refreshing the session here
  //    first is a wasted Supabase round-trip (and could race a just-rotated cookie).
  // Page protection is unchanged: no protected prefix lives under /api or /auth.
  matcher: [
    "/((?!api|auth|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
