// app/(auth)/_components/ResetRequestForm.tsx — request a password-reset e-mail.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, MailCheck, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const schema = z.object({
  email: z.string().trim().min(1, "Zadejte e-mail").email("Neplatný e-mail"),
});

type FormValues = z.infer<typeof schema>;

export function ResetRequestForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const sb = createClient();
    // The recovery link routes through /auth/callback, which detects type=recovery
    // and forwards the user to /nove-heslo to set a new password.
    const { error } = await sb.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("rate limit") || m.includes("too many")) {
        setServerError("Příliš mnoho pokusů. Zkuste to prosím za chvíli.");
      } else {
        setServerError("Něco se nepovedlo. Zkuste to prosím znovu.");
      }
      return;
    }
    // Always show success — we don't reveal whether the e-mail exists.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-teal-100 p-5 text-sm text-ink">
          <div className="flex items-center gap-2 font-semibold text-teal">
            <MailCheck size={18} /> Zkontrolujte e-mail
          </div>
          <p className="mt-2 text-ink-soft">
            Pokud k zadané adrese existuje účet, poslali jsme na ni odkaz pro
            obnovu hesla. Platnost odkazu je omezená — otevřete ho co nejdříve.
          </p>
        </div>
        <Link
          href="/prihlaseni"
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-navy hover:underline"
        >
          <ArrowLeft size={15} /> Zpět na přihlášení
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <div className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
          E-mail
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="jan@email.cz"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-rust">{errors.email.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        Poslat odkaz pro obnovu
      </Button>

      <p className="pt-1 text-center text-sm text-ink-soft">
        <Link href="/prihlaseni" className="font-medium text-navy hover:underline">
          Zpět na přihlášení
        </Link>
      </p>
    </form>
  );
}
