// POST /api/ai/extract — z nahraného dokumentu vytvoří AI NÁVRH dat.
// Stáhne soubor z privátního úložiště, zavolá extractDocument() a uloží
// řádek document_extractions (status 'draft', s confidence). Žádné auto-potvrzení.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractDocument } from "@/lib/ai";

const Body = z.object({ documentId: z.string().uuid() });

export async function POST(request: Request) {
  // Auth: RLS běží pod přihlášeným uživatelem — neoprávněný dotaz nic nevrátí.
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

  // RLS zajistí, že vidíme jen dokument vlastní domácnosti/nemovitosti.
  const { data: doc, error: docErr } = await sb
    .from("documents")
    .select("id, file_path, mime")
    .eq("id", parsed.documentId)
    .maybeSingle();
  if (docErr || !doc) {
    return NextResponse.json({ error: "Dokument nenalezen" }, { status: 404 });
  }

  // Stáhnout obsah z privátního bucketu (TTL podpisu zde neřešíme — čteme přímo).
  const { data: blob, error: dlErr } = await sb.storage
    .from("documents")
    .download(doc.file_path);
  if (dlErr || !blob) {
    return NextResponse.json({ error: "Soubor se nepodařilo načíst" }, { status: 502 });
  }

  const mime = doc.mime || blob.type || "application/octet-stream";
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;

  let extracted;
  try {
    extracted = await extractDocument(dataUrl);
  } catch {
    return NextResponse.json({ error: "AI extrakce selhala" }, { status: 502 });
  }

  const confidence =
    typeof extracted.confidence === "number" ? extracted.confidence : null;

  // Uložit NÁVRH (status draft). Uživatel ho v detailu potvrdí nebo odmítne.
  const { data: extraction, error: insErr } = await sb
    .from("document_extractions")
    .insert({
      document_id: doc.id,
      extracted,
      confidence,
      provider: "openai",
      model: process.env.AI_MODEL ?? "gpt-5.5",
      status: "draft",
    })
    .select("id, status, confidence")
    .single();
  if (insErr || !extraction) {
    return NextResponse.json({ error: "Návrh se nepodařilo uložit" }, { status: 500 });
  }

  return NextResponse.json({ extraction });
}
