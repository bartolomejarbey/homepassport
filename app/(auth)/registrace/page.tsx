// app/(auth)/registrace/page.tsx — signup page. Redirects authenticated users to /prehled.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "@/app/(auth)/_components/AuthForm";
import { safeNextPath } from "@/app/(auth)/_components/safe-path";

export const metadata = {
  title: "Registrace",
  description:
    "Založte si digitální pas nemovitosti zdarma — dokumenty, majetek, záruky i revize na jednom místě.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user) redirect(safeNextPath(next));

  return (
    <div>
      <h1 className="text-2xl text-ink">Založte si pas zdarma</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Celý váš domov na jednom místě — dokumenty, majetek, záruky i revize.
      </p>

      <div className="mt-6">
        <AuthForm mode="signup" next={next} />
      </div>

      <p className="mt-5 text-center text-xs text-muted">
        Registrací souhlasíte se zpracováním údajů nezbytných pro provoz služby.
      </p>
    </div>
  );
}
