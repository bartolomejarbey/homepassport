// app/auth/callback/route.ts — exchanges the auth code for a Supabase session, then redirects.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to send the user after a successful exchange (safe internal path only).
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/prehled";

  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code or exchange failed — back to login with an error flag.
  return NextResponse.redirect(`${origin}/prihlaseni?error=auth`);
}
