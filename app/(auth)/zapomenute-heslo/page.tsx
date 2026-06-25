// app/(auth)/zapomenute-heslo/page.tsx — request a password-reset e-mail.
import { ResetRequestForm } from "@/app/(auth)/_components/ResetRequestForm";

export const metadata = {
  title: "Obnova hesla",
  description: "Zapomněli jste heslo? Pošleme vám odkaz pro nastavení nového.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl text-ink">Zapomenuté heslo</h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Zadejte e-mail, kterým se přihlašujete. Pošleme vám odkaz pro nastavení
        nového hesla.
      </p>

      <div className="mt-6">
        <ResetRequestForm />
      </div>
    </div>
  );
}
