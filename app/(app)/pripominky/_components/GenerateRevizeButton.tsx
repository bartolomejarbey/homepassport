"use client";
// Akce "Spočítat revize" — zavolá POST /api/revize/generate pro danou nemovitost,
// pak obnoví seznam připomínek. Výsledek (kolik vzniklo / přeskočeno) ukáže jako
// nenápadný stavový řádek. Žádné auto-potvrzování — připomínky vznikají rovnou
// se správným wording_type, takže UI ukáže poctivě, co je povinné vs doporučené.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Result = {
  evaluated: number;
  created: number;
  skipped: number;
  superseded: number;
  usage: string;
};

const USAGE_LABEL: Record<string, string> = {
  owner_occupied: "vlastní bydlení",
  rental: "pronájem",
  svj: "SVJ / bytový dům",
  business: "podnikání",
};

export function GenerateRevizeButton({
  propertyId,
  contextReady = true,
}: {
  propertyId: string;
  /** Aspoň jeden způsob užívání musí být vyplněný, jinak by výpočet slepě
   *  předpokládal vlastní bydlení. Když není, tlačítko zůstane neaktivní. */
  contextReady?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const busy = loading || pending;

  async function run() {
    if (!contextReady) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/revize/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Revize se nepodařilo spočítat.");
        return;
      }
      setResult(json as Result);
      // Obnovit serverovou část stránky, aby se nové připomínky objevily.
      startTransition(() => router.refresh());
    } catch {
      setError("Spojení se serverem selhalo. Zkuste to prosím znovu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button
        variant="honey"
        onClick={run}
        disabled={busy || !contextReady}
        title={
          contextReady
            ? undefined
            : "Nejdřív vyplňte způsob užívání nemovitosti."
        }
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Sparkles size={15} />
        )}
        Spočítat revize
      </Button>

      {error && <p className="text-xs text-rust">{error}</p>}

      {result && !error && (
        <p className="text-xs text-muted">
          {result.evaluated === 0
            ? "Pro tuto nemovitost a způsob užívání nemáme žádnou revizi k hlídání"
            : result.created > 0
              ? `Přidáno ${result.created} ${result.created === 1 ? "připomínka" : result.created < 5 ? "připomínky" : "připomínek"}`
              : result.superseded > 0
                ? "Připomínky jsme aktualizovali podle nového využití"
                : "Vše už máte spočítané"}
          {result.evaluated > 0 && result.skipped > 0 && ` · ${result.skipped} už existovalo`}
          {result.superseded > 0 && ` · ${result.superseded} nahrazeno dle nového využití`}
          {" · režim: "}
          {USAGE_LABEL[result.usage] ?? result.usage}
        </p>
      )}
    </div>
  );
}
