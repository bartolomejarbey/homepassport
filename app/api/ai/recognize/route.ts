// POST /api/ai/recognize — z fotky předmětu vytvoří AI NÁVRH položky majetku.
// Stáhne obrázek z privátního bucketu "assets", zavolá recognizeAsset() a vrátí
// návrh (name/category/brand/model/confidence). Nic neukládá — řádek assets
// vznikne až po potvrzení uživatelem v PhotoCapture.
//
// ROBUSTNOST: nic se neukládá, takže selhání/timeout AI jen vrátí čistý JSON
// {error,code}; uživatel pak vyplní položku ručně (fotka v úložišti zůstává).
// Vstup je limitovaný (Content-Length + zod), AI volání je per-uživatel
// rate-limitované kvůli nákladům (best-effort, per-instance).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recognizeAsset } from "@/lib/ai";
import { aiRecognizeBody as Body } from "@/lib/validation/schemas";
import { jsonError, readJson, rejectIfTooLarge, rateLimitGuard } from "@/lib/util/api";

export async function POST(request: Request) {
  try {
    const tooLarge = rejectIfTooLarge(request);
    if (tooLarge) return tooLarge;

    // Auth: RLS běží pod přihlášeným uživatelem.
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return jsonError("Neautorizováno", 401, "unauthorized");
    }

    const limited = rateLimitGuard("ai:recognize", user.id);
    if (limited) return limited;

    const parsedInput = Body.safeParse(await readJson(request));
    if (!parsedInput.success) {
      return jsonError("Neplatný vstup", 400, "invalid_input");
    }
    const parsed = parsedInput.data;

    // Storage RLS (storage_household_ok) zajistí, že čteme jen soubor vlastní
    // domácnosti — cesta musí začínat <household_id>/.
    const { data: blob, error: dlErr } = await sb.storage
      .from("assets")
      .download(parsed.path);
    if (dlErr || !blob) {
      return jsonError("Fotku se nepodařilo načíst", 502, "download_failed");
    }

    const mime = blob.type || "image/jpeg";
    // Vision model očekává obrázek. Pokud pod cestou není obrázek (jiný typ
    // souboru), nemá smysl plýtvat voláním AI — vrátíme srozumitelnou chybu.
    if (!mime.startsWith("image/")) {
      return jsonError("Soubor není obrázek", 415, "unsupported_media_type");
    }
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    let raw: unknown;
    try {
      raw = await recognizeAsset(dataUrl);
    } catch {
      return jsonError("Rozpoznání fotky selhalo", 502, "ai_failed");
    }

    // recognizeAsset() vrací naparsovaný JSON od AI — při selhání to ale může být i
    // jiný typ než objekt (null / pole). Zúžíme na bezpečný objekt, ať čtení polí
    // níže nikdy nespadne (nikdy AI slepě nedůvěřujeme).
    const r = (raw && typeof raw === "object" ? raw : {}) as {
      name?: unknown;
      category?: unknown;
      brand?: unknown;
      model?: unknown;
      confidence?: unknown;
    };

    // Sanitace návrhu: jen řetězce a spolehlivost sevřená do 0–1 (AI občas vrátí
    // > 1 nebo nesmysl). Vracíme NÁVRH — confidence vždy ukazujeme uživateli.
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;
    const confidence =
      typeof r.confidence === "number" && Number.isFinite(r.confidence)
        ? Math.min(1, Math.max(0, r.confidence))
        : undefined;

    const guess = {
      name: str(r.name),
      category: str(r.category),
      brand: str(r.brand),
      model: str(r.model),
      confidence,
    };

    return NextResponse.json({ guess });
  } catch {
    return jsonError("Neočekávaná chyba serveru", 500, "internal_error");
  }
}
