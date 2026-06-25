// POST /api/ai/value — hrubý odhad tržní hodnoty položky majetku.
// Zavolá estimateValue() a do řádku assets uloží estimated_value (střed rozsahu)
// + estimated_value_confidence. Vrací i rozsah low/high, aby šel zobrazit jako
// odhad, nikdy ne jako pevná cena.
//
// ROBUSTNOST: položka majetku už v DB existuje; odhad je jen doplňková hodnota,
// takže selhání/timeout AI vrátí čistý JSON {error,code} a položku nijak
// nepoškodí. Vstup limitovaný (Content-Length + zod UUID), AI volání per-uživatel
// rate-limitované (ochrana nákladů, best-effort).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateValue } from "@/lib/ai";
import { aiValueBody as Body } from "@/lib/validation/schemas";
import { jsonError, readJson, rejectIfTooLarge, rateLimitGuard } from "@/lib/util/api";

export async function POST(request: Request) {
  try {
    const tooLarge = rejectIfTooLarge(request);
    if (tooLarge) return tooLarge;

    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return jsonError("Neautorizováno", 401, "unauthorized");
    }

    const limited = rateLimitGuard("ai:value", user.id);
    if (limited) return limited;

    const parsedInput = Body.safeParse(await readJson(request));
    if (!parsedInput.success) {
      return jsonError("Neplatný vstup", 400, "invalid_input");
    }
    const parsed = parsedInput.data;

    // RLS (assets_access) zajistí, že vidíme jen položku vlastní domácnosti.
    const { data: asset, error: assetErr } = await sb
      .from("assets")
      .select("id, name, brand, model, purchase_date")
      .eq("id", parsed.assetId)
      .maybeSingle();
    if (assetErr || !asset) {
      return jsonError("Položka nenalezena", 404, "not_found");
    }

    // Stáří v letech z data pořízení (pokud je k dispozici).
    let ageYears: number | undefined;
    if (asset.purchase_date) {
      const ms = Date.now() - new Date(asset.purchase_date).getTime();
      const y = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
      if (Number.isFinite(y) && y >= 0) ageYears = y;
    }

    // Model zpřesňuje odhad — připojíme ho k názvu, protože estimateValue() přijímá
    // jen name/brand/age_years. (Brand jde zvlášť, aby se v názvu nezdvojoval.)
    const nameForEstimate = asset.model
      ? `${asset.name} ${asset.model}`.trim()
      : asset.name;

    let est: unknown;
    try {
      est = await estimateValue({
        name: nameForEstimate,
        brand: asset.brand ?? undefined,
        age_years: ageYears,
      });
    } catch {
      return jsonError("Odhad hodnoty selhal", 502, "ai_failed");
    }

    // estimateValue() vrací JSON od AI — při selhání parsování to ale může být i
    // jiný typ než objekt (null / pole). Zúžíme na bezpečný objekt, ať čtení polí
    // níže nikdy nespadne (nikdy AI slepě nedůvěřujeme).
    const e = (est && typeof est === "object" ? est : {}) as {
      low?: unknown;
      high?: unknown;
      confidence?: unknown;
    };

    // Sanitace: bereme jen konečná nezáporná čísla. Pokud AI vrátí rozsah pozpátku
    // (low > high), prohodíme ho, aby zobrazení "od–do" bylo vždy poctivé.
    const cleanNum = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

    let low = cleanNum(e.low);
    let high = cleanNum(e.high);
    if (low !== null && high !== null && low > high) {
      [low, high] = [high, low];
    }
    const confidence =
      typeof e.confidence === "number" && Number.isFinite(e.confidence)
        ? Math.min(1, Math.max(0, e.confidence))
        : null;

    // estimateValue() je smluvně odhad v CZK (a celá zobrazovací vrstva — seznam,
    // detail i souhrn — počítá výhradně v Kč a hodnoty sčítá). Sloupec currency
    // navíc neukládáme. Měnu proto držíme napevno na CZK; kdybychom propustili cizí
    // kód od AI, uložené číslo by se jinde vykreslilo a sečetlo jako koruny.
    const currency = "CZK";

    // Uložená hodnota = střed rozsahu (hrubý odhad). Rozsah vracíme klientovi
    // pro čestné zobrazení "od–do".
    const mid =
      low !== null && high !== null
        ? Math.round((low + high) / 2)
        : (high ?? low);

    if (mid === null) {
      return jsonError("AI nevrátila použitelný odhad", 502, "ai_no_result");
    }

    const { error: updErr } = await sb
      .from("assets")
      .update({
        estimated_value: mid,
        estimated_value_confidence: confidence,
      })
      .eq("id", asset.id);
    if (updErr) {
      return jsonError("Odhad se nepodařilo uložit", 500, "persist_failed");
    }

    return NextResponse.json({
      estimate: {
        low,
        high,
        mid,
        currency,
        confidence,
      },
    });
  } catch {
    return jsonError("Neočekávaná chyba serveru", 500, "internal_error");
  }
}
