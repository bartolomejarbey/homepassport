// app/auth/dev-bypass/route.ts — sets the local "skip login" cookie and enters
// the app. HARD-DISABLED in production (see lib/dev-bypass.ts): there the cookie
// is never honored and this route just bounces to the real login screen.
import { NextResponse } from "next/server";
import { DEV_BYPASS_AVAILABLE, DEV_BYPASS_COOKIE } from "@/lib/dev-bypass";

export async function POST(request: Request) {
  const { origin, searchParams } = new URL(request.url);

  if (!DEV_BYPASS_AVAILABLE) {
    return NextResponse.redirect(`${origin}/prihlaseni`, { status: 303 });
  }

  // Respect an optional ?next=/path (e.g. a deep link the user came from); only
  // same-origin absolute paths are allowed, otherwise fall back to the dashboard.
  const next = searchParams.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/prehled";

  const res = NextResponse.redirect(`${origin}${dest}`, { status: 303 });
  res.cookies.set(DEV_BYPASS_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h — a local working session
  });
  return res;
}
