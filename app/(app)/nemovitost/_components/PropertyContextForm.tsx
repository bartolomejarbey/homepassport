// Client questionnaire that writes property_contexts (drives the revize engine).
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { PropertyContext } from "@/lib/db/types";
import type { PropertyType } from "./PropertyMeta";
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
type PreviewTone = "legal_required" | "recommended" | "insurance_recommended";
const SYSTEMS: { key: SystemKey; label: string; shortLabel: string; hint: string }[] = [
  {
    key: "has_chimney",
    label: "Komín / spalinová cesta",
    shortLabel: "Komín",
    hint: "Krb, kamna, kotel na tuhá paliva nebo plyn s odvodem spalin.",
  },
  {
    key: "has_gas",
    label: "Plynová instalace",
    shortLabel: "Plyn",
    hint: "Plynový kotel, sporák, přípojka.",
  },
  {
    key: "has_electrical",
    label: "Elektroinstalace",
    shortLabel: "Elektro",
    hint: "Domovní rozvody elektřiny.",
  },
  {
    key: "has_lps",
    label: "Hromosvod (LPS)",
    shortLabel: "Hromosvod",
    hint: "Systém ochrany před bleskem.",
  },
  {
    key: "has_pv",
    label: "Fotovoltaika",
    shortLabel: "Fotovoltaika",
    hint: "Solární panely / FVE.",
  },
];

function usageFromCtx(ctx: PropertyContext): UsageKey {
  if (ctx.business_use) return "business";
  if (ctx.svj) return "svj";
  if (ctx.rental) return "rental";
  return "owner_occupied";
}

// Honesty matrix — MUST mirror the seeded revision_rules exactly, otherwise the
// badge tone here would contradict the wording_type of the reminder the engine
// actually creates. A missing cell means there is no rule for that combination,
// so the engine generates nothing and we must not promise a reminder.
//
// Keyed by property type because the seed differs per type: gas/electrical/lps
// rules exist ONLY for 'house'; the chimney rule exists for 'house' AND
// 'apartment'. The API /api/revize/generate selects rules with
// `property_type = <type> OR property_type IS NULL`, so for 'unit'/'land'/
// 'commercial' (no rules, none NULL) the engine produces nothing — and so must
// this preview. Source of truth: supabase/seed.sql (CZ rules).
type SystemMatrix = Record<SystemKey, Partial<Record<UsageKey, PreviewTone>>>;

const HOUSE_MATRIX: SystemMatrix = {
  has_chimney: { owner_occupied: "legal_required" },
  has_gas: {
    owner_occupied: "insurance_recommended",
    rental: "legal_required",
    svj: "legal_required",
  },
  has_electrical: {
    owner_occupied: "insurance_recommended",
    rental: "legal_required",
    business: "legal_required",
  },
  has_lps: { owner_occupied: "recommended" },
  has_pv: {},
};

// Apartment: only the chimney rule is seeded (and only for owner_occupied).
const APARTMENT_MATRIX: SystemMatrix = {
  has_chimney: { owner_occupied: "legal_required" },
  has_gas: {},
  has_electrical: {},
  has_lps: {},
  has_pv: {},
};

// unit / land / commercial: no seeded rules at all.
const EMPTY_MATRIX: SystemMatrix = {
  has_chimney: {},
  has_gas: {},
  has_electrical: {},
  has_lps: {},
  has_pv: {},
};

function matrixForType(type: PropertyType): SystemMatrix {
  if (type === "house") return HOUSE_MATRIX;
  if (type === "apartment") return APARTMENT_MATRIX;
  return EMPTY_MATRIX;
}

export function PropertyContextForm({
  propertyId,
  propertyType,
  initial,
}: {
  propertyId: string;
  propertyType: PropertyType;
  initial: PropertyContext | null;
}) {
  const ruleMatrix = matrixForType(propertyType);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [genResult, setGenResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);

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

  // Honesty preview — reflects exactly what the engine will create (see ruleMatrix).
  const previewWording = useMemo(() => {
    const out: { label: string; tone: PreviewTone }[] = [];
    for (const s of SYSTEMS) {
      if (!systems[s.key]) continue;
      const tone = ruleMatrix[s.key][usage];
      if (tone) out.push({ label: s.shortLabel, tone });
    }
    return out;
  }, [usage, systems, ruleMatrix]);

  // Systems present whose combination has NO matching rule (engine stays silent).
  // We name them explicitly so the user understands why no reminder appears.
  const silentSystems = useMemo(() => {
    const out: string[] = [];
    for (const s of SYSTEMS) {
      if (systems[s.key] && !ruleMatrix[s.key][usage]) out.push(s.shortLabel);
    }
    return out;
  }, [usage, systems, ruleMatrix]);

  // Honest explainer — depends on which rules actually exist for this property type.
  const explainerCopy =
    propertyType === "house"
      ? "U vlastního bydlení je ze zákona povinná pouze kontrola komínu. Ostatní revize doporučujeme — bývají podmínkou pojištění nebo prevencí škod. Povinnými se stávají u pronájmu, SVJ či podnikání."
      : propertyType === "apartment"
        ? "U bytu je ze zákona povinná pouze kontrola spalinové cesty, máte-li napojený spotřebič na komín. Revize plynu a elektroinstalace v bytě obvykle zajišťuje SVJ či bytové družstvo pro celý dům."
        : "Pro tento typ nemovitosti zatím nevedeme žádné zákonné ani doporučené revize. Konkrétní povinnosti se řídí způsobem využití a charakterem prostoru.";

  function toggleSystem(key: SystemKey) {
    setSaved(false);
    setSystems((s) => ({ ...s, [key]: !s[key] }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setGenResult(null);
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

      // Wire to the revize engine: recompute contextual reminders right away so
      // the questionnaire actually does something. The engine produces honest
      // drafts (correct wording_type) and de-duplicates, so re-saving is safe.
      try {
        const gen = await fetch("/api/revize/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId }),
        });
        if (gen.ok) {
          const json = (await gen.json()) as {
            created?: number;
            skipped?: number;
          };
          setGenResult({
            created: json.created ?? 0,
            skipped: json.skipped ?? 0,
          });
        }
      } catch {
        // Saving the context is the primary action; reminder generation is a
        // best-effort follow-up. The user can always recompute from Připomínky.
      }

      router.refresh();
    });
  }

  function plural(n: number, one: string, few: string, many: string) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
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
            <p className="mt-1 text-sm text-ink-soft">{explainerCopy}</p>
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
            Pro tuto kombinaci využití a systémů zatím nemáme žádnou připomínku
            revize — buď jste nevybrali žádný systém, nebo pro daný režim
            nevzniká povinnost ani doporučení.
          </p>
        )}

        {silentSystems.length > 0 && previewWording.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            U tohoto využití nepřipravujeme připomínku pro:{" "}
            {silentSystems.join(", ")}. Neznamená to, že kontrola nedává smysl —
            jen pro daný režim není zákonná ani pojistná povinnost.
          </p>
        )}
      </section>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {saved && !pending && (
          <span className="flex items-center gap-1.5 text-sm text-teal">
            <CheckCircle2 size={16} />
            Uloženo
          </span>
        )}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          Uložit a spočítat revize
        </Button>
      </div>

      {saved && !pending && genResult && (
        <div className="flex flex-col gap-1.5 rounded-md border border-teal/30 bg-teal-100/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-ink">
            {genResult.created > 0
              ? `Z kontextu jsme připravili ${genResult.created} ${plural(
                  genResult.created,
                  "připomínku",
                  "připomínky",
                  "připomínek",
                )} revizí.`
              : genResult.skipped > 0
                ? "Připomínky revizí už podle tohoto kontextu existují."
                : "Z tohoto kontextu zatím nevyplývá žádná připomínka revize."}
          </span>
          <Link
            href="/pripominky"
            className="inline-flex items-center gap-1 font-medium text-teal transition-colors hover:text-ink"
          >
            Zobrazit připomínky
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </form>
  );
}
