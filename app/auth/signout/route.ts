// app/auth/signout/route.ts — signs the user out and returns them to the landing page.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEV_BYPASS_COOKIE } from "@/lib/dev-bypass";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const sb = await createClient();
  await sb.auth.signOut();
  const res = NextResponse.redirect(`${origin}/`, { status: 303 });
  // Also drop the local dev-bypass cookie so "Odhlásit se" exits the bypass too.
  res.cookies.delete(DEV_BYPASS_COOKIE);
  return res;
}
