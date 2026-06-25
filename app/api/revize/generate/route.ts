// POST /api/revize/generate — spočítá kontextové revize pro nemovitost.
// Načte property_contexts + revision_rules, předá je čisté funkci
// buildReminderDrafts() a založí připomínky (reminders) — bez duplicit.
// Klíč pro deduplikaci: property_id + title + legal_basis (1:1 na pravidlo v daném
// kontextu užívání). Schéma reminders zatím nemá sloupec system_type.
//
// HONEST COPY: wording_type pravidla se přenáší 1:1 do reminders.wording_type,
// takže UI ukáže správně, co je legal_required vs recommended vs insurance.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReminderDrafts, activeUsage } from "@/lib/revize/engine";
import type { PropertyContext, RevisionRule } from "@/lib/db/types";

const Body = z.object({ propertyId: z.string().uuid() });

/** Suggested first due date: today + interval_months (null interval => no date). */
function suggestDueDate(intervalMonths: number | null): string | null {
  if (!intervalMonths || intervalMonths <= 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + intervalMonths);
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }

  // RLS (propctx_access / can_access_property) zaručí, že načteme kontext jen
  // u nemovitosti, ke které má uživatel přístup.
  const { data: ctxRow, error: ctxErr } = await sb
    .from("property_contexts")
    .select(
      "property_id, owner_occupied, rental, svj, business_use, has_chimney, chimney_fuel, has_gas, has_electrical, has_lps, has_pv",
    )
    .eq("property_id", parsed.propertyId)
    .maybeSingle();

  if (ctxErr) {
    return NextResponse.json({ error: "Kontext se nepodařilo načíst" }, { status: 500 });
  }
  if (!ctxRow) {
    return NextResponse.json(
      { error: "Nemovitost nemá vyplněný kontext. Doplňte ho v sekci Nemovitost." },
      { status: 404 },
    );
  }

  const ctx = ctxRow as PropertyContext;

  // Poctivost: bez vyplněného způsobu užívání bychom slepě spadli do
  // owner_occupied (fallback v activeUsage) a vygenerovali revize pro režim,
  // který uživatel nikdy nepotvrdil. Stejně jako detail nemovitosti považujeme
  // kontext za vyplněný, až když je aspoň jeden režim užívání zaškrtnutý.
  const usageSet =
    ctx.owner_occupied || ctx.rental || ctx.svj || ctx.business_use;
  if (!usageSet) {
    return NextResponse.json(
      {
        error:
          "Nejdřív vyplňte způsob užívání nemovitosti (vlastní bydlení / pronájem / SVJ / podnikání). Podle něj poctivě určíme, co je povinné a co jen doporučené.",
      },
      { status: 409 },
    );
  }

  // Typ nemovitosti (house/apartment/…) potřebujeme k výběru správného pravidla.
  // Pravidla revizí jsou seedovaná zvlášť pro 'house' i 'apartment', takže bez
  // filtru na typ by stejný systém (např. komín) vygeneroval dvě připomínky.
  const { data: propRow } = await sb
    .from("properties")
    .select("type")
    .eq("id", parsed.propertyId)
    .maybeSingle();
  const propertyType = (propRow?.type as string | null) ?? null;

  // Vlastnickou domácnost potřebujeme, aby reminders měly household scope
  // (RLS reminders_access akceptuje household i property; ukládáme oba).
  const { data: ownerLink } = await sb
    .from("property_owners")
    .select("household_id")
    .eq("property_id", parsed.propertyId)
    .limit(1)
    .maybeSingle();
  const householdId = ownerLink?.household_id ?? null;

  // Referenční data: revize pravidla (RLS rules_read — čitelná všem přihlášeným).
  // Vybíráme jen pravidla pro daný typ nemovitosti nebo univerzální (property_type
  // NULL) — tím se vyhneme duplicitám napříč typy (house vs apartment).
  let rulesQuery = sb
    .from("revision_rules")
    .select(
      "id, country, property_type, usage_context, system_type, interval_months, interval_note, wording_type, legal_basis, message",
    )
    .eq("country", "CZ");
  if (propertyType) {
    rulesQuery = rulesQuery.or(
      `property_type.eq.${propertyType},property_type.is.null`,
    );
  }
  const { data: rulesData, error: rulesErr } = await rulesQuery;

  if (rulesErr) {
    return NextResponse.json({ error: "Pravidla revizí se nepodařilo načíst" }, { status: 500 });
  }
  const rules = (rulesData as RevisionRule[] | null) ?? [];

  // Čistá funkce: vybere jen pravidla pro aktivní způsob užívání a přítomné systémy.
  // Pojistka proti duplicitám: kdyby pro jeden systém existovalo víc pravidel
  // (typové + univerzální), necháme jen jedno — s přednostní zákonnou povinností.
  const wordingPriority: Record<string, number> = {
    legal_required: 0,
    insurance_recommended: 1,
    recommended: 2,
  };
  const bySystem = new Map<string, ReturnType<typeof buildReminderDrafts>[number]>();
  for (const d of buildReminderDrafts(ctx, rules)) {
    const prev = bySystem.get(d.system_type);
    if (
      !prev ||
      (wordingPriority[d.wording_type] ?? 9) < (wordingPriority[prev.wording_type] ?? 9)
    ) {
      bySystem.set(d.system_type, d);
    }
  }
  const drafts = [...bySystem.values()];

  // Existující připomínky této nemovitosti — deduplikace dle title + legal_basis.
  // Schéma reminders nemá sloupec system_type, takže systém u existující připomínky
  // odvozujeme zpětně z legal_basis pravidla (legal_basis -> system_type).
  const { data: existingData } = await sb
    .from("reminders")
    .select("id, title, legal_basis, status")
    .eq("property_id", parsed.propertyId)
    .eq("type", "inspection");
  const existing = existingData ?? [];
  const seen = new Set(
    existing.map((r) => `${r.title} ${r.legal_basis ?? ""}`),
  );

  // Mapa legal_basis -> system_type přes VŠECHNA načtená pravidla (napříč režimy
  // užívání). Slouží k rozpoznání, ke kterému systému patří stará připomínka.
  const basisToSystem = new Map<string, string>();
  for (const r of rules) {
    if (r.legal_basis) basisToSystem.set(r.legal_basis, r.system_type);
  }
  const newBasisBySystem = new Map<string, string | null>();
  for (const d of drafts) newBasisBySystem.set(d.system_type, d.legal_basis);

  // Supersedace: změní-li uživatel způsob užívání (např. vlastní bydlení → pronájem),
  // u téhož systému se mění wording_type i právní základ. Staré OTEVŘENÉ připomínky
  // pro tentýž systém, které už neodpovídají aktuálnímu pravidlu, poctivě uzavřeme
  // jako 'dismissed' — jinak by vedle sebe svítila rozporná znění (doporučeno × ze zákona).
  const supersededIds = existing
    .filter((r) => r.status === "open" || r.status === "snoozed")
    .filter((r) => {
      const sys = r.legal_basis ? basisToSystem.get(r.legal_basis) : undefined;
      if (!sys || !newBasisBySystem.has(sys)) return false;
      return newBasisBySystem.get(sys) !== (r.legal_basis ?? null);
    })
    .map((r) => r.id);

  let superseded = 0;
  if (supersededIds.length > 0) {
    const { error: supErr } = await sb
      .from("reminders")
      .update({ status: "dismissed" })
      .in("id", supersededIds);
    if (!supErr) superseded = supersededIds.length;
    // Uzavřené nesmí blokovat dedup nového znění → vyjmeme je ze 'seen'.
    for (const r of existing) {
      if (supersededIds.includes(r.id)) seen.delete(`${r.title} ${r.legal_basis ?? ""}`);
    }
  }

  const toInsert = drafts
    .filter((d) => !seen.has(`${d.title} ${d.legal_basis ?? ""}`))
    .map((d) => ({
      property_id: parsed.propertyId,
      household_id: householdId,
      type: "inspection" as const,
      title: d.title,
      due_date: suggestDueDate(d.interval_months),
      wording_type: d.wording_type,
      legal_basis: d.legal_basis,
      status: "open" as const,
    }));

  let created = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await sb
      .from("reminders")
      .insert(toInsert)
      .select("id");
    if (insErr) {
      return NextResponse.json(
        { error: "Připomínky se nepodařilo založit" },
        { status: 500 },
      );
    }
    created = inserted?.length ?? 0;
  }

  // audit_events má jen SELECT policy (RLS) — zápis proto vede přes service role,
  // jinak by ho RLS tiše zahodila a audit stopa by chyběla.
  await createAdminClient()
    .from("audit_events")
    .insert({
      actor_id: user.id,
      household_id: householdId,
      property_id: parsed.propertyId,
      action: "revize.generated",
      target: { usage: activeUsage(ctx), drafts: drafts.length, created, superseded },
    });

  return NextResponse.json({
    usage: activeUsage(ctx),
    evaluated: drafts.length,
    created,
    skipped: drafts.length - created,
    superseded,
  });
}
