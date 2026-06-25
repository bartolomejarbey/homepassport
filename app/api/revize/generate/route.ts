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
  const { data: rulesData, error: rulesErr } = await sb
    .from("revision_rules")
    .select(
      "id, country, property_type, usage_context, system_type, interval_months, interval_note, wording_type, legal_basis, message",
    )
    .eq("country", "CZ");

  if (rulesErr) {
    return NextResponse.json({ error: "Pravidla revizí se nepodařilo načíst" }, { status: 500 });
  }
  const rules = (rulesData as RevisionRule[] | null) ?? [];

  // Čistá funkce: vybere jen pravidla pro aktivní způsob užívání a přítomné systémy.
  const drafts = buildReminderDrafts(ctx, rules);

  // Existující připomínky této nemovitosti — deduplikace dle title + legal_basis.
  const { data: existingData } = await sb
    .from("reminders")
    .select("id, title, legal_basis, status")
    .eq("property_id", parsed.propertyId)
    .eq("type", "inspection");
  const existing = existingData ?? [];
  const seen = new Set(
    existing.map((r) => `${r.title} ${r.legal_basis ?? ""}`),
  );

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

  await sb.from("audit_events").insert({
    actor_id: user.id,
    household_id: householdId,
    property_id: parsed.propertyId,
    action: "revize.generated",
    target: { usage: activeUsage(ctx), drafts: drafts.length, created },
  });

  return NextResponse.json({
    usage: activeUsage(ctx),
    evaluated: drafts.length,
    created,
    skipped: drafts.length - created,
  });
}
