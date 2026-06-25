// Přehled — chybová hranice dashboardu. Stránka /prehled střílí několik dotazů do
// Supabase najednou (počty dokumentů, připomínek, majetku, kontext nemovitosti).
// Když kterýkoli krátce selže (síť / nedostupný server), bez této hranice by se
// místo přehledu ukázal neostylovaný Next.js error. Tahle obrazovka drží uživatele
// uvnitř aplikace (hlavička i menu zůstávají) a nabízí reálnou cestu ven — zkusit
// znovu, nebo přejít na nemovitost. Stejný vzor jako (auth)/error.tsx.
"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function PrehledError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">Přehled</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          Přehled se nepodařilo načíst
        </h1>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          Vaše data se teď nepovedlo načíst. Bývá to jen dočasný výpadek spojení —
          zkuste to prosím za okamžik znovu.
        </p>
      </header>

      <div className="card flex items-start gap-3 border-rust-100 bg-rust-100/60 text-sm text-rust">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <span>
          Připojení k serveru se nezdařilo. Zkontrolujte připojení k internetu a
          zkuste to znovu.
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => reset()}>
          <RotateCcw size={16} /> Zkusit znovu
        </Button>
        <Link href="/nemovitost" className="btn btn-ghost text-sm">
          <Home size={16} /> Otevřít nemovitost
        </Link>
      </div>
    </div>
  );
}
