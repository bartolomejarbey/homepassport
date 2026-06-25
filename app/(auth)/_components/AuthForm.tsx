// app/(auth)/_components/AuthForm.tsx — shared client form for login & signup (react-hook-form + zod).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { safeNextPath } from "./safe-path";

type Mode = "login" | "signup";

const schema = z.object({
  fullName: z.string().trim().optional(),
  email: z.string().trim().min(1, "Zadejte e-mail").email("Neplatný e-mail"),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků"),
});

type FormValues = z.infer<typeof schema>;

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const destination = safeNextPath(next);
  // Preserve ?next when switching between the login and signup screens, so a user
  // who arrived via a deep link (e.g. /prevzit/<token>) still bounces back there
  // after authenticating instead of landing on the default /prehled.
  const loginHref = next ? { pathname: "/prihlaseni", query: { next } } : "/prihlaseni";
  const signupHref = next ? { pathname: "/registrace", query: { next } } : "/registrace";

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const sb = createClient();

    if (isSignup) {
      const { data, error } = await sb.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          // full_name is read by the handle_new_user() trigger to seed the profile.
          data: { full_name: values.fullName?.trim() || null },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            destination,
          )}`,
        },
      });
      if (error) {
        setServerError(translateError(error.message));
        return;
      }
      // If e-mail confirmation is required, there is no active session yet.
      if (!data.session) {
        setConfirmSent(true);
        return;
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        setServerError(translateError(error.message));
        return;
      }
    }

    router.replace(destination);
    router.refresh();
  }

  if (confirmSent) {
    return (
      <div className="rounded-lg border border-line bg-teal-100 p-5 text-sm text-ink">
        <div className="flex items-center gap-2 font-semibold text-teal">
          <MailCheck size={18} /> Zkontrolujte e-mail
        </div>
        <p className="mt-2 text-ink-soft">
          Poslali jsme vám potvrzovací odkaz. Po jeho otevření se přihlásíte
          a přejdete do svého pasu.
        </p>
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

      {isSignup && (
        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-ink">
            Jméno a příjmení
          </label>
          <Input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="Jan Novák"
            {...register("fullName")}
          />
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

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="password" className="block text-sm font-medium text-ink">
            Heslo
          </label>
          {!isSignup && (
            <Link
              href="/zapomenute-heslo"
              className="text-xs font-medium text-navy hover:underline"
            >
              Zapomenuté heslo?
            </Link>
          )}
        </div>
        <Input
          id="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder="••••••••"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p className="mt-1 text-xs text-rust">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        {isSignup ? "Založit pas zdarma" : "Přihlásit se"}
      </Button>

      <p className="pt-1 text-center text-sm text-ink-soft">
        {isSignup ? (
          <>
            Už máte účet?{" "}
            <Link href={loginHref} className="font-medium text-navy hover:underline">
              Přihlásit se
            </Link>
          </>
        ) : (
          <>
            Nemáte účet?{" "}
            <Link href={signupHref} className="font-medium text-navy hover:underline">
              Vytvořit účet
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

// Map common Supabase auth errors to friendly Czech messages.
function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Nesprávný e-mail nebo heslo.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Tento e-mail je už zaregistrovaný. Zkuste se přihlásit.";
  if (m.includes("email not confirmed"))
    return "E-mail zatím nebyl potvrzen. Zkontrolujte svou schránku.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Příliš mnoho pokusů. Zkuste to prosím za chvíli.";
  return "Něco se nepovedlo. Zkuste to prosím znovu.";
}
