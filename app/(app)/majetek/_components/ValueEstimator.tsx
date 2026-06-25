"use client";
// ValueEstimator — spustí hrubý odhad hodnoty přes /api/ai/value a zobrazí ho
// POCTIVĚ jako rozsah „od–do" (ne pevná cena), spolu se spolehlivostí. Route do
// assets uloží střed rozsahu; tady ukazujeme celý rozsah. Po uložení obnovíme
// server data, aby se hodnota propsala i do seznamu a souhrnu.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Estimate = {
  low: number | null;
  high: number | null;
  mid: number | null;
  currency: string;
  confidence: number | null;
};

function fmtCzk(n: number | null, currency = "CZK") {
  if (n === null || Number.isNaN(n)) return null;
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtConfidence(c: number | null) {
  if (c === null || Number.isNaN(c)) return "neuvedeno";
  return `${Math.round(c * 100)} %`;
}

// Nízká spolehlivost AI není „nebezpečí" ani zákonná povinnost — proto nikdy
// červený (legal_required) tón. Jen neutrální / teplý odstín dle jistoty.
function confidenceTone(c: number | null) {
  if (c === null) return "draft" as const;
  if (c >= 0.8) return "verified" as const;
  if (c >= 0.5) return "insurance_recommended" as const;
  return "draft" as const;
}

export function ValueEstimator({
  assetId,
  hasEstimate,
}: {
  assetId: string;
  hasEstimate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Odhad se nepodařilo spočítat.");
      }
      const { estimate: est } = (await res.json()) as { estimate: Estimate };
      setEstimate(est);
      // Propsat uloženou hodnotu do serverem renderovaného detailu i seznamu.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Odhad selhal.");
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;

  // Rozsah „od–do": preferuj low/high, jinak ukaž alespoň střed jako přibližný.
  const low = estimate?.low ?? null;
  const high = estimate?.high ?? null;
  const rangeLabel =
    low !== null && high !== null && high !== low
      ? `${fmtCzk(low, estimate?.currency)} – ${fmtCzk(high, estimate?.currency)}`
      : estimate?.mid !== null && estimate?.mid !== undefined
        ? `~ ${fmtCzk(estimate.mid, estimate?.currency)}`
        : null;

  return (
    <div className="space-y-3">
      {estimate && rangeLabel && (
        <div className="rounded-md border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">Odhadovaný rozsah</p>
            <Badge tone={confidenceTone(estimate.confidence)}>
              Spolehlivost {fmtConfidence(estimate.confidence)}
            </Badge>
          </div>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">
            {rangeLabel}
          </p>
          <p className="mt-2 text-xs text-muted">
            Hrubý odhad obvyklé tržní hodnoty použité věci v ČR, ne znalecký
            posudek. Uloženo bylo orientačně střed rozsahu.
          </p>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 text-sm text-rust">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      <Button type="button" variant="honey" onClick={run} disabled={working}>
        {working ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Odhaduji…
          </>
        ) : (
          <>
            <Wand2 size={15} />
            {hasEstimate || estimate ? "Přepočítat odhad" : "Odhadnout hodnotu"}
          </>
        )}
      </Button>
    </div>
  );
}
