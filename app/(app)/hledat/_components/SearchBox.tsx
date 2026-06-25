"use client";
// SearchBox — pošle přirozený dotaz na /api/ai/search a zobrazí odpověď
// s citovanými zdroji (odkazy na dokument/majetek) a upozorněním. Veškeré
// hledání běží jen nad vlastními daty uživatele.
import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  AlertCircle,
  FileText,
  Package,
  Info,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Source = {
  kind: "document" | "asset";
  id: string;
  title: string;
  href: string;
};
type SearchResult = {
  answer: string;
  sources: Source[];
  disclaimer: string;
};

const EXAMPLES = [
  "Kdy mi končí záruka na pračku?",
  "Mám revizní zprávu komínu?",
  "Kolik stál bojler a od koho je faktura?",
] as const;

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function run(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setError("Zadejte prosím delší dotaz.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Hledání se nezdařilo.");
      }
      setResult(data as SearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hledání se nezdařilo.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(query);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zeptejte se na cokoli ve svých datech…"
            className="pl-9"
            aria-label="Dotaz na vaše data"
            autoFocus
          />
        </div>
        <Button
          type="submit"
          variant="honey"
          disabled={busy || query.trim().length < 2}
          className="shrink-0"
        >
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Hledám…
            </>
          ) : (
            "Hledat"
          )}
        </Button>
      </form>

      {!result && !busy && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                run(ex);
              }}
              className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-navy/30 hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-rust">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
              {result.answer}
            </p>

            {result.sources.length > 0 && (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Zdroje
                </p>
                <ul className="space-y-1.5">
                  {result.sources.map((s) => (
                    <li key={`${s.kind}:${s.id}`}>
                      <Link
                        // Běhová cesta na detail dokumentu/majetku (/dokumenty/:id,
                        // /majetek/:id). typedRoutes je vypnuté → stačí string.
                        href={s.href}
                        className="group flex items-center gap-2 text-sm text-navy hover:underline"
                      >
                        {s.kind === "document" ? (
                          <FileText size={14} className="shrink-0 text-honey" />
                        ) : (
                          <Package size={14} className="shrink-0 text-honey" />
                        )}
                        <span className="truncate">{s.title}</span>
                        <ArrowRight
                          size={13}
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <p className="flex items-start gap-2 text-xs text-muted">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>{result.disclaimer}</span>
          </p>
        </div>
      )}
    </div>
  );
}
