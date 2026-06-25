// Client questionnaire that writes property_contexts (drives the revize engine).
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { PropertyContext } from "@/lib/db/types";
import { updatePropertyContext } from "./actions";

type UsageKey = "owner_occupied" | "rental" | "svj" | "business";

const USAGE_OPTIONS: { key: UsageKey; label: string; hint: string }[] = [
  {
    key: "owner_occupied",
    label: "Bydlím zde / vlastní bydlení",
    hint: "Rodinné bydlení ve vlastní nemovitosti.",
  },
  {
    key: "rental",
    label: "Pronájem",
    hint: "Nemovitost pronajímám nájemníkům.",
  },
  {
    key: "svj",
    label: "SVJ / bytový dům",
    hint: "Společné prostory ve sdíleném domě.",
  },
  {
    key: "business",
    label: "Podnikání / komerční využití",
    hint: "Prostor sloužící k podnikání.",
  },
];

type FuelKey = "solid" | "liquid" | "gas";
const FUEL_OPTIONS: { key: FuelKey; label: string }[] = [
  { key: "solid", label: "Tuhá paliva (dřevo, uhlí)" },
  { key: "liquid", label: "Kapalná paliva (nafta, olej)" },
  { key: "gas", label: "Plyn" },
];

type SystemKey = "has_chimney" | "has_gas" | "has_electrical" | "has_lps" | "has_pv";
const SYSTEMS: { key: SystemKey; label: string; hint: string }[] = [
  {
    key: "has_chimney",
    label: "Komín / spalinová cesta",
    hint: "Krb, kamna, kotel na tuhá paliva nebo plyn s odvodem spalin.",
  },
  { key: "has_gas", label: "Plynová instalace", hint: "Plynový kotel, sporák, přípojka." },
  {
    key: "has_electrical",
    label: "Elektroinstalace",
    hint: "Domovní rozvody elektřiny.",
  },
  { key: "has_lps", label: "Hromosvod (LPS)", hint: "Systém ochrany před bleskem." },
  { key: "has_pv", label: "Fotovoltaika", hint: "Solární panely / FVE." },
];

function usageFromCtx(ctx: PropertyContext): UsageKey {
  if (ctx.business_use) return "business";
  if (ctx.svj) return "svj";
  if (ctx.rental) return "rental";
  return "owner_occupied";
}

export function PropertyContextForm({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: PropertyContext | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [usage, setUsage] = useState<UsageKey>(
    initial ? usageFromCtx(initial) : "owner_occupied",
  );
  const [systems, setSystems] = useState<Record<SystemKey, boolean>>({
    has_chimney: initial?.has_chimney ?? false,
    has_gas: initial?.has_gas ?? false,
    has_electrical: initial?.has_electrical ?? true,
    has_lps: initial?.has_lps ?? false,
    has_pv: initial?.has_pv ?? false,
  });
  const [fuel, setFuel] = useState<FuelKey | null>(
    (initial?.chimney_fuel as FuelKey | null) ?? null,
  );

  // Honesty preview: only the chimney is "legal_required" for owner-occupied homes;
  // gas/electrical move to "recommended"/"insurance_recommended" unless the usage
  // is rental / svj / business.
  const previewWording = useMemo(() => {
    const isOwnerHome = usage === "owner_occupied";
    const out: { label: string; tone: "legal_required" | "recommended" | "insurance_recommended" }[] = [];
    if (systems.has_chimney) {
      out.push({ label: "Komín", tone: "legal_required" });
    }
    if (systems.has_gas) {
      out.push({
        label: "Plyn",
        tone: isOwnerHome ? "insurance_recommended" : "legal_required",
      });
    }
    if (systems.has_electrical) {
      out.push({
        label: "Elektro",
        tone: isOwnerHome ? "recommended" : "legal_required",
      });
    }
    if (systems.has_lps) out.push({ label: "Hromosvod", tone: "recommended" });
    if (systems.has_pv) out.push({ label: "Fotovoltaika", tone: "recommended" });
    return out;
  }, [usage, systems]);

  function toggleSystem(key: SystemKey) {
    setSaved(false);
    setSystems((s) => ({ ...s, [key]: !s[key] }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const payload = {
      property_id: propertyId,
      owner_occupied: usage === "owner_occupied",
      rental: usage === "rental",
      svj: usage === "svj",
      business_use: usage === "business",
      has_chimney: systems.has_chimney,
      chimney_fuel: systems.has_chimney ? fuel : null,
      has_gas: systems.has_gas,
      has_electrical: systems.has_electrical,
      has_lps: systems.has_lps,
      has_pv: systems.has_pv,
    };
    startTransition(async () => {
      const res = await updatePropertyContext(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Usage */}
      <section className="card p-5">
        <h2 className="font-display text-lg font-semibold text-ink">
          Jak nemovitost využíváte?
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Způsob využití rozhoduje o tom, které revize jsou skutečně povinné.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {USAGE_OPTIONS.map((o) => {
            const active = usage === o.key;
            return (
              <label
                key={o.key}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors " +
                  (active
                    ? "border-navy bg-navy/5"
                    : "border-line hover:bg-surface-2")
                }
              >
                <input
                  type="radio"
                  name="usage"
                  className="mt-0.5 accent-navy"
                  checked={active}
                  onChange={() => {
                    setSaved(false);
                    setUsage(o.key);
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">
                    {o.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {/* Systems */}
      <section className="card p-5">
        <h2 className="font-display text-lg font-semibold text-ink">
          Jaké systémy nemovitost má?
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Zaškrtněte, co se v nemovitosti nachází — podle toho připravíme připomínky revizí.
        </p>
        <div className="mt-4 space-y-2">
          {SYSTEMS.map((s) => {
            const active = systems[s.key];
            return (
              <div key={s.key}>
                <label
                  className={
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors " +
                    (active
                      ? "border-navy bg-navy/5"
                      : "border-line hover:bg-surface-2")
                  }
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-navy"
                    checked={active}
                    onChange={() => toggleSystem(s.key)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">
                      {s.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{s.hint}</span>
                  </span>
                </label>

                {s.key === "has_chimney" && active && (
                  <div className="ml-9 mt-2 rounded-md border border-line bg-surface-2 p-3">
                    <p className="mb-2 text-xs font-medium text-ink-soft">
                      Druh paliva
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {FUEL_OPTIONS.map((f) => {
                        const fActive = fuel === f.key;
                        return (
                          <label
                            key={f.key}
                            className={
                              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors " +
                              (fActive
                                ? "border-navy bg-navy text-white"
                                : "border-line bg-surface text-ink-soft hover:bg-surface-2")
                            }
                          >
                            <input
                              type="radio"
                              name="chimney_fuel"
                              className="sr-only"
                              checked={fActive}
                              onChange={() => {
                                setSaved(false);
                                setFuel(f.key);
                              }}
                            />
                            {f.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Honest preview */}
      <section className="card p-5">
        <div className="flex items-start gap-2">
          <Info size={18} className="mt-0.5 shrink-0 text-honey" />
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Co z toho vyplývá
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              U vlastního bydlení je ze zákona povinná pouze kontrola komínu.
              Ostatní revize doporučujeme — bývají podmínkou pojištění nebo
              prevencí škod. Povinnými se stávají u pronájmu, SVJ či podnikání.
            </p>
          </div>
        </div>

        {previewWording.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {previewWording.map((p) => (
              <Badge key={p.label} tone={p.tone}>
                {p.label}
                {p.tone === "legal_required"
                  ? " — povinné"
                  : p.tone === "insurance_recommended"
                    ? " — pojištění"
                    : " — doporučené"}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Zatím jste nevybrali žádný systém.
          </p>
        )}
      </section>

      <div className="flex items-center justify-end gap-3">
        {saved && !pending && (
          <span className="flex items-center gap-1.5 text-sm text-teal">
            <CheckCircle2 size={16} />
            Uloženo
          </span>
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          Uložit kontext
        </Button>
      </div>
    </form>
  );
}
