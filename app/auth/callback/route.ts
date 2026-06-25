// app/auth/callback/route.ts — turns an auth link into a Supabase session, then redirects.
//
// Handles three flows: e-mail confirmation (signup), magic links, and password
// recovery. It also tolerates BOTH email-template styles a Supabase project can
// be configured with:
//   • PKCE links carry  ?code=...            -> exchangeCodeForSession
//   • Older/OTP links carry ?token_hash=&type=... -> verifyOtp
// Supporting both means confirmation and recovery work no matter how the project's
// e-mail templates are set up, instead of silently dead-ending at ?error=auth.
//
// For password recovery we deliberately ignore ?next and send the user to the
// set-new-password page, because at that point they only hold a short-lived
// recovery session.
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/app/(auth)/_components/safe-path";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  // Where to send the user after a successful exchange (safe internal path only).
  const next = safeNextPath(searchParams.get("next"));
  const isRecovery = type === "recovery";

  const sb = await createClient();
  let exchanged = false;

  if (code) {
    // PKCE flow (default for @supabase/ssr): one-time code -> session.
    const { error } = await sb.auth.exchangeCodeForSession(code);
    exchanged = !error;
  } else if (tokenHash && type) {
    // OTP / token-hash flow (older e-mail templates): verify the hash -> session.
    const { error } = await sb.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    exchanged = !error;
  }

  if (exchanged) {
    // Password recovery links land here too — route them to set a new password.
    if (isRecovery) {
      return NextResponse.redirect(`${origin}/nove-heslo`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // No usable token, or the exchange failed — back to login with an error flag.
  return NextResponse.redirect(`${origin}/prihlaseni?error=auth`);
}
