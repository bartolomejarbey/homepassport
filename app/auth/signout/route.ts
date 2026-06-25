// app/auth/signout/route.ts — signs the user out and returns them to the landing page.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const sb = await createClient();
  await sb.auth.signOut();
  return NextResponse.redirect(`${origin}/`, { status: 303 });
}
