// app/(auth)/_components/NewPasswordForm.tsx — set a new password after a recovery link.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const schema = z
  .object({
    password: z.string().min(8, "Heslo musí mít alespoň 8 znaků"),
    confirm: z.string().min(1, "Zopakujte heslo"),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Hesla se neshodují",
  });

type FormValues = z.infer<typeof schema>;

export function NewPasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const sb = createClient();
    const { error } = await sb.auth.updateUser({ password: values.password });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("same") || m.includes("different from the old")) {
        setServerError("Nové heslo musí být jiné než to staré.");
      } else if (m.includes("session") || m.includes("auth")) {
        setServerError(
          "Platnost odkazu vypršela. Vyžádejte si prosím nový odkaz pro obnovu hesla.",
        );
      } else {
        setServerError("Heslo se nepodařilo změnit. Zkuste to prosím znovu.");
      }
      return;
    }
    setDone(true);
    // Give the user a beat to read the confirmation, then send them into the app.
    setTimeout(() => {
      router.replace("/prehled");
      router.refresh();
    }, 1200);
  }

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-line bg-teal-100 p-5 text-sm text-ink">
        <div className="flex items-center gap-2 font-semibold text-teal">
          <CheckCircle2 size={18} aria-hidden="true" /> Heslo bylo změněno
        </div>
        <p className="mt-2 text-ink-soft">Přesměrováváme vás do vašeho pasu…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
          Nové heslo
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "new-password-error" : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p id="new-password-error" className="mt-1 text-xs text-rust">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-ink">
          Heslo znovu
        </label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
          {...register("confirm")}
        />
        {errors.confirm && (
          <p id="confirm-error" className="mt-1 text-xs text-rust">{errors.confirm.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        Uložit nové heslo
      </Button>
    </form>
  );
}
