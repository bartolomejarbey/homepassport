// app/(app)/error.tsx — group-level error boundary for the authenticated app.
// Pages here fan several queries at Supabase; if one throws (e.g. no backend
// configured locally), this keeps the user inside the app shell with a calm,
// styled screen and a way out instead of a raw Next.js error. Page-specific
// boundaries (e.g. prehled/error.tsx) still take precedence where they exist.
"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
          Stránku se nepodařilo načíst
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
        <Link href="/prehled" className="btn btn-ghost text-sm">
          <Home size={16} /> Zpět na přehled
        </Link>
      </div>
    </div>
  );
}
