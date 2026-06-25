// POST /api/ai/extract — z nahraného dokumentu vytvoří AI NÁVRH dat.
// Stáhne soubor z privátního úložiště, zavolá extractDocument() a uloží
// řádek document_extractions (status 'draft', s confidence). Žádné auto-potvrzení.
//
// ROBUSTNOST: dokument už v DB existuje (vytváří ho klient před tímto voláním),
// takže extrakce je vždy jen BEST-EFFORT návrh — selhání/timeout poskytovatele
// AI vrátí čistý JSON {error,code} (4xx/5xx), nikdy nespadne a hlavně nikdy
// nezahodí už nahraný soubor. Vstup je limitovaný (Content-Length + zod UUID),
// AI volání je per-uživatel rate-limitované (ochrana nákladů, best-effort).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractDocument, type DocExtraction } from "@/lib/ai";
import { aiExtractBody as Body } from "@/lib/validation/schemas";
import { jsonError, readJson, rejectIfTooLarge, rateLimitGuard } from "@/lib/util/api";

export async function POST(request: Request) {
  try {
    // Vstupní limit: tělo je drobný JSON ({documentId}). Cokoli velkého odmítneme
    // dřív, než ho vůbec načteme do paměti.
    const tooLarge = rejectIfTooLarge(request);
    if (tooLarge) return tooLarge;

    // Auth: RLS běží pod přihlášeným uživatelem — neoprávněný dotaz nic nevrátí.
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return jsonError("Neautorizováno", 401, "unauthorized");
    }

    // Per-uživatel rate-limit (ochrana proti runaway nákladům na AI). Best-effort,
    // per-instance — viz lib/util/rate-limit.ts.
    const limited = rateLimitGuard("ai:extract", user.id);
    if (limited) return limited;

    const parsedInput = Body.safeParse(await readJson(request));
    if (!parsedInput.success) {
      return jsonError("Neplatný vstup", 400, "invalid_input");
    }
    const parsed = parsedInput.data;

    // RLS zajistí, že vidíme jen dokument vlastní domácnosti/nemovitosti.
    const { data: doc, error: docErr } = await sb
      .from("documents")
      .select("id, file_path, mime")
      .eq("id", parsed.documentId)
      .maybeSingle();
    if (docErr || !doc) {
      return jsonError("Dokument nenalezen", 404, "not_found");
    }

    // Stáhnout obsah z privátního bucketu (TTL podpisu zde neřešíme — čteme přímo).
    const { data: blob, error: dlErr } = await sb.storage
      .from("documents")
      .download(doc.file_path);
    if (dlErr || !blob) {
      return jsonError("Soubor se nepodařilo načíst", 502, "download_failed");
    }

    const mime = doc.mime || blob.type || "application/octet-stream";
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    let extracted: DocExtraction;
    try {
      extracted = await extractDocument(dataUrl);
    } catch {
      // Poskytovatel AI selhal / vypršel timeout. Dokument zůstává nedotčený v DB
      // i v úložišti; uživatel může extrakci kdykoli spustit znovu z detailu.
      return jsonError("AI extrakce selhala", 502, "ai_failed");
    }

    const confidence =
      typeof extracted.confidence === "number" ? extracted.confidence : null;

    // Nový návrh nahrazuje starý: dosud nevyřízené koncepty téhož dokumentu označíme
    // jako odmítnuté, ať se nehromadí neviditelné duplicitní návrhy (detail i seznam
    // pracují vždy jen s nejnovější extrakcí).
    await sb
      .from("document_extractions")
      .update({ status: "rejected", reviewed_by: user.id })
      .eq("document_id", doc.id)
      .eq("status", "draft");

    // Uložit NÁVRH (status draft). Uživatel ho v detailu potvrdí nebo odmítne.
    const { data: extraction, error: insErr } = await sb
      .from("document_extractions")
      .insert({
        document_id: doc.id,
        extracted,
        confidence,
        // Provenance návrhu odpovídá skutečně použitému poskytovateli (provider je
        // přepínatelný přes env — stejně jako v B2B nahrávání); jinak by řádek lhal o zdroji.
        provider: process.env.AI_PROVIDER ?? "openai",
        model: process.env.AI_MODEL ?? "gpt-5.5",
        status: "draft",
      })
      .select("id, status, confidence")
      .single();
    if (insErr || !extraction) {
      return jsonError("Návrh se nepodařilo uložit", 500, "persist_failed");
    }

    return NextResponse.json({ extraction });
  } catch {
    // Poslední záchrana: cokoli neočekávaného (např. výpadek DB klienta) skončí
    // jako čistý JSON 500, nikdy jako HTML chybová stránka Next.js.
    return jsonError("Neočekávaná chyba serveru", 500, "internal_error");
  }
}
