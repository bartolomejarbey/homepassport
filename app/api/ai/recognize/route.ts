// POST /api/ai/recognize — z fotky předmětu vytvoří AI NÁVRH položky majetku.
// Stáhne obrázek z privátního bucketu "assets", zavolá recognizeAsset() a vrátí
// návrh (name/category/brand/model/confidence). Nic neukládá — řádek assets
// vznikne až po potvrzení uživatelem v PhotoCapture.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { recognizeAsset } from "@/lib/ai";

const Body = z.object({ path: z.string().min(1).max(400) });

export async function POST(request: Request) {
  // Auth: RLS běží pod přihlášeným uživatelem.
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

  // Storage RLS (storage_household_ok) zajistí, že čteme jen soubor vlastní
  // domácnosti — cesta musí začínat <household_id>/.
  const { data: blob, error: dlErr } = await sb.storage
    .from("assets")
    .download(parsed.path);
  if (dlErr || !blob) {
    return NextResponse.json(
      { error: "Fotku se nepodařilo načíst" },
      { status: 502 },
    );
  }

  const mime = blob.type || "image/jpeg";
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;

  let raw;
  try {
    raw = await recognizeAsset(dataUrl);
  } catch {
    return NextResponse.json(
      { error: "Rozpoznání fotky selhalo" },
      { status: 502 },
    );
  }

  // Sanitace návrhu: jen řetězce a spolehlivost sevřená do 0–1 (AI občas vrátí
  // > 1 nebo nesmysl). Vracíme NÁVRH — confidence vždy ukazujeme uživateli.
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : undefined;

  const guess = {
    name: str(raw.name),
    category: str(raw.category),
    brand: str(raw.brand),
    model: str(raw.model),
    confidence,
  };

  return NextResponse.json({ guess });
}
