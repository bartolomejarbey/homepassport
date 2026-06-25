// app/(auth)/nove-heslo/page.tsx — set a new password (reached via a recovery link).
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "@/app/(auth)/_components/NewPasswordForm";

export const metadata = { title: "Nové heslo — Home Passport" };

export default async function NewPasswordPage() {
  // The /auth/callback handler exchanged the recovery code for a session before
  // redirecting here, so an authenticated user is expected. If there is none,
  // the link was invalid or expired — guide the user to request a fresh one.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return (
      <div>
        <h1 className="text-2xl text-ink">Odkaz není platný</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Odkaz pro obnovu hesla vypršel nebo už byl použit.
        </p>
        <div className="mt-5 flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>Vyžádejte si prosím nový odkaz pro obnovu hesla.</span>
        </div>
        <div className="mt-5 flex flex-col gap-2 text-sm">
          <Link href="/zapomenute-heslo" className="font-medium text-navy hover:underline">
            Poslat nový odkaz
          </Link>
          <Link href="/prihlaseni" className="font-medium text-navy hover:underline">
            Zpět na přihlášení
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl text-ink">Nastavte nové heslo</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Zvolte si nové heslo k účtu {user.email}.
      </p>

      <div className="mt-6">
        <NewPasswordForm />
      </div>
    </div>
  );
}
