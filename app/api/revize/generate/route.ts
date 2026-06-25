// POST /api/revize/generate — spočítá kontextové revize pro nemovitost.
// Načte property_contexts + revision_rules, předá je čisté funkci
// buildReminderDrafts() a založí připomínky (reminders) — bez duplicit.
// Klíč pro deduplikaci: property_id + title + legal_basis (1:1 na pravidlo v daném
// kontextu užívání). Schéma reminders zatím nemá sloupec system_type.
//
// HONEST COPY: wording_type pravidla se přenáší 1:1 do reminders.wording_type,
// takže UI ukáže správně, co je legal_required vs recommended vs insurance.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReminderDrafts, activeUsage } from "@/lib/revize/engine";
import {
  collapseBySystem,
  computeSupersededIds,
  buildSeenKeys,
  reminderKey,
  suggestDueDate,
} from "@/lib/revize/dedup";
import { revizeGenerateBody as Body } from "@/lib/validation/schemas";
import type { PropertyContext, RevisionRule } from "@/lib/db/types";
import { jsonError, readJson, rejectIfTooLarge } from "@/lib/util/api";

export async function POST(request: Request) {
  try {
    // Tělo je drobný JSON ({propertyId}) — větší odmítneme předem.
    const tooLarge = rejectIfTooLarge(request);
    if (tooLarge) return tooLarge;

    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return jsonError("Neautorizováno", 401, "unauthorized");
    }

    const parsedInput = Body.safeParse(await readJson(request));
    if (!parsedInput.success) {
      return jsonError("Neplatný vstup", 400, "invalid_input");
    }
    const parsed = parsedInput.data;

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
    // (collapseBySystem / dedup / supersede logiku viz lib/revize/dedup.ts — čisté
    //  funkce, ať jdou testovat bez Supabase klienta.)
    const drafts = collapseBySystem(buildReminderDrafts(ctx, rules));

    // Existující připomínky této nemovitosti — deduplikace dle title + legal_basis.
    // Schéma reminders nemá sloupec system_type, takže systém u existující připomínky
    // odvozujeme zpětně z legal_basis pravidla (legal_basis -> system_type).
    const { data: existingData } = await sb
      .from("reminders")
      .select("id, title, legal_basis, status")
      .eq("property_id", parsed.propertyId)
      .eq("type", "inspection");
    const existing = existingData ?? [];

    // Supersedace: změní-li uživatel kontext nemovitosti, staré OTEVŘENÉ připomínky
    // už nemusí odpovídat realitě. Poctivě je uzavřeme jako 'dismissed', když se pro
    // jejich systém změnil právní základ (změna režimu užívání) nebo systém vypadl.
    const supersededIds = computeSupersededIds(existing, drafts, rules);

    let superseded = 0;
    if (supersededIds.length > 0) {
      const { error: supErr } = await sb
        .from("reminders")
        .update({ status: "dismissed" })
        .in("id", supersededIds);
      if (!supErr) superseded = supersededIds.length;
    }

    // Dedup blokuje JEN aktivní (open/snoozed) připomínky, a nikdy ne ty právě
    // supersedované (ty mají dostat nové znění). Vyřízená (done) revize je uzavřený
    // minulý cyklus — opětovné „Spočítat revize“ má pak naplánovat další termín.
    const seen = buildSeenKeys(existing, supersededIds);

    const toInsert = drafts
      .filter((d) => !seen.has(reminderKey(d.title, d.legal_basis)))
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
  } catch {
    // Poslední záchrana: cokoli neočekávaného skončí jako čistý JSON 500.
    return jsonError("Neočekávaná chyba serveru", 500, "internal_error");
  }
}
