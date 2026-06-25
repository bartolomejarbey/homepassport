// app/auth/callback/route.ts — exchanges the auth code for a Supabase session, then redirects.
// Handles three flows: e-mail confirmation (signup), magic links, and password
// recovery. For recovery we ignore ?next and send the user to the set-new-password
// page, because at that point they only have a short-lived recovery session.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/app/(auth)/_components/safe-path";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  // Where to send the user after a successful exchange (safe internal path only).
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const sb = await createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      // Password recovery links land here too — route them to set a new password.
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/nove-heslo`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code or exchange failed — back to login with an error flag.
  return NextResponse.redirect(`${origin}/prihlaseni?error=auth`);
}
