// app/(auth)/error.tsx — error boundary for the auth pages.
// The login & signup pages do a server-side getUser() to redirect already
// authenticated users; if Supabase is briefly unreachable that call throws and
// would otherwise surface as an unstyled Next.js error. This keeps the user on a
// branded screen with a real recovery path (retry, or jump back to login).
"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AuthError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl text-ink">Něco se nepovedlo</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Přihlášení teď nešlo načíst. Zkuste to prosím za okamžik znovu.
        </p>
      </div>

      <div role="alert" className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>Připojení k serveru se nezdařilo. Zkontrolujte síť a zkuste to znovu.</span>
      </div>

      <Button type="button" className="w-full" onClick={() => reset()}>
        <RotateCcw size={16} aria-hidden="true" /> Zkusit znovu
      </Button>

      <p className="text-center text-sm text-ink-soft">
        <Link href="/prihlaseni" className="font-medium text-navy hover:underline">
          Zpět na přihlášení
        </Link>
      </p>
    </div>
  );
}
