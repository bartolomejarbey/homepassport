// proxy.ts — Next.js 16 renamed `middleware` to `proxy` (same file convention,
// project root). Refreshes the Supabase session on every request and guards the
// app routes before they render.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );

  // IMPORTANT: getUser() refreshes the session and must run before any redirect.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicException = PUBLIC_EXCEPTIONS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isProtected =
    !isPublicException &&
    PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/prihlaseni";
    // Preserve the originally requested path so we can bounce back after login.
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Run on all paths except static assets, image optimizer, and metadata files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
