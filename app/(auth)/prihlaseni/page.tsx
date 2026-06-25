// app/(auth)/prihlaseni/page.tsx — login page. Redirects authenticated users to /prehled.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "@/app/(auth)/_components/AuthForm";

export const metadata = { title: "Přihlášení — Home Passport" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user) redirect(next && next.startsWith("/") ? next : "/prehled");

  return (
    <div>
      <h1 className="text-2xl text-ink">Vítejte zpět</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Přihlaste se do digitálního pasu své nemovitosti.
      </p>

      {error === "auth" && (
        <p className="mt-4 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
          Přihlášení se nezdařilo nebo odkaz vypršel. Zkuste to prosím znovu.
        </p>
      )}

      <div className="mt-6">
        <AuthForm mode="login" next={next} />
      </div>
    </div>
  );
}
