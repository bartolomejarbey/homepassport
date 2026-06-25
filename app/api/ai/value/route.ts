// POST /api/ai/value — hrubý odhad tržní hodnoty položky majetku.
// Zavolá estimateValue() a do řádku assets uloží estimated_value (střed rozsahu)
// + estimated_value_confidence. Vrací i rozsah low/high, aby šel zobrazit jako
// odhad, nikdy ne jako pevná cena.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { estimateValue } from "@/lib/ai";

const Body = z.object({ assetId: z.string().uuid() });

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

  // RLS (assets_access) zajistí, že vidíme jen položku vlastní domácnosti.
  const { data: asset, error: assetErr } = await sb
    .from("assets")
    .select("id, name, brand, model, purchase_date")
    .eq("id", parsed.assetId)
    .maybeSingle();
  if (assetErr || !asset) {
    return NextResponse.json({ error: "Položka nenalezena" }, { status: 404 });
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

  let est;
  try {
    est = await estimateValue({
      name: nameForEstimate,
      brand: asset.brand ?? undefined,
      age_years: ageYears,
    });
  } catch {
    return NextResponse.json({ error: "Odhad hodnoty selhal" }, { status: 502 });
  }

  // Sanitace: bereme jen konečná nezáporná čísla. Pokud AI vrátí rozsah pozpátku
  // (low > high), prohodíme ho, aby zobrazení "od–do" bylo vždy poctivé.
  const cleanNum = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

  let low = cleanNum(est.low);
  let high = cleanNum(est.high);
  if (low !== null && high !== null && low > high) {
    [low, high] = [high, low];
  }
  const confidence =
    typeof est.confidence === "number" && Number.isFinite(est.confidence)
      ? Math.min(1, Math.max(0, est.confidence))
      : null;

  // Měna musí být platný 3písmenný ISO kód, jinak by Intl.NumberFormat na
  // klientovi spadl (AI občas vrátí "Kč" apod.). Při pochybnosti → CZK.
  const currency =
    typeof est.currency === "string" && /^[A-Za-z]{3}$/.test(est.currency)
      ? est.currency.toUpperCase()
      : "CZK";

  // Uložená hodnota = střed rozsahu (hrubý odhad). Rozsah vracíme klientovi
  // pro čestné zobrazení "od–do".
  const mid =
    low !== null && high !== null
      ? Math.round((low + high) / 2)
      : (high ?? low);

  if (mid === null) {
    return NextResponse.json(
      { error: "AI nevrátila použitelný odhad" },
      { status: 502 },
    );
  }

  const { error: updErr } = await sb
    .from("assets")
    .update({
      estimated_value: mid,
      estimated_value_confidence: confidence,
    })
    .eq("id", asset.id);
  if (updErr) {
    return NextResponse.json(
      { error: "Odhad se nepodařilo uložit" },
      { status: 500 },
    );
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
}
