// POST /api/ai/search — přirozený dotaz NAD VLASTNÍMI daty uživatele.
// 1) embed(dotaz) → 2) najdi nejbližší úryvky pro domácnost (pgvector cosine přes RPC,
// fallback ILIKE nad documents/assets) → 3) ragAnswer() s citacemi. Nikdy
// neodpovídá mimo data uživatele: bez podkladů vrátíme prázdnou odpověď.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { embed, ragAnswer } from "@/lib/ai";

const Body = z.object({ query: z.string().trim().min(2).max(500) });

// Zdroj citace odkazuje zpět na konkrétní dokument nebo položku majetku.
type Source = {
  kind: "document" | "asset";
  id: string;
  title: string;
  href: string;
};
type Chunk = { id: string; text: string; source: Source };

const MAX_CHUNKS = 8;

export async function POST(request: Request) {
  // RLS běží pod přihlášeným uživatelem — bez přihlášení nic nevidíme.
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
    return NextResponse.json({ error: "Neplatný dotaz" }, { status: 400 });
  }
  const query = parsed.query;

  // Najdi domácnost uživatele (RLS zaručí, že jde o vlastní domácnost).
  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const householdId = membership?.household_id ?? null;
  if (!householdId) {
    return NextResponse.json({
      answer: "Zatím nemáte žádná data, ve kterých bych mohl hledat.",
      sources: [],
      disclaimer:
        "Asistent odpovídá pouze na základě vašich vlastních dokumentů a majetku.",
    });
  }

  // Doprovodné metadaty pro převod embeddings → citovatelný zdroj.
  const docTitles = new Map<string, string>();
  const assetTitles = new Map<string, string>();

  let chunks: Chunk[] = [];

  // --- 1) Sémantické vyhledávání přes pgvector (cosine) ---------------------
  try {
    const queryEmbedding = await embed(query);
    // RPC match_embeddings je SECURITY INVOKER → respektuje RLS domácnosti.
    const { data: matches, error: rpcErr } = await sb.rpc("match_embeddings", {
      query_embedding: queryEmbedding,
      match_household_id: householdId,
      match_count: MAX_CHUNKS,
    });
    if (!rpcErr && Array.isArray(matches)) {
      chunks = (matches as EmbeddingMatch[])
        .map(rowToChunk)
        .filter((c): c is Chunk => c !== null);
    }
  } catch {
    // Embedding nebo RPC nedostupné — spadneme na textový fallback níže.
  }

  // --- 2) Fallback: ILIKE nad documents + assets ----------------------------
  // Spustí se, když ještě nejsou žádné embeddings (nebo selhal sémantický krok).
  if (chunks.length === 0) {
    const like = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const half = Math.ceil(MAX_CHUNKS / 2);

    const [{ data: docs }, { data: assets }] = await Promise.all([
      sb
        .from("documents")
        .select("id, title, category")
        .eq("household_id", householdId)
        .ilike("title", like)
        .limit(half),
      sb
        .from("assets")
        .select("id, name, brand, model, room, category")
        .eq("household_id", householdId)
        .or(
          `name.ilike.${like},brand.ilike.${like},model.ilike.${like},room.ilike.${like}`,
        )
        .limit(half),
    ]);

    for (const d of docs ?? []) {
      const title = d.title ?? "Dokument";
      docTitles.set(d.id, title);
      chunks.push({
        id: `doc:${d.id}`,
        text: `Dokument „${title}" (kategorie: ${d.category}).`,
        source: {
          kind: "document",
          id: d.id,
          title,
          href: `/dokumenty/${d.id}`,
        },
      });
    }
    for (const a of assets ?? []) {
      assetTitles.set(a.id, a.name);
      const parts = [a.brand, a.model, a.room ? `místnost ${a.room}` : null]
        .filter(Boolean)
        .join(", ");
      chunks.push({
        id: `asset:${a.id}`,
        text: `Položka majetku „${a.name}"${parts ? ` (${parts})` : ""}.`,
        source: {
          kind: "asset",
          id: a.id,
          title: a.name,
          href: `/majetek/${a.id}`,
        },
      });
    }
  }

  // Žádné podklady → neodpovídáme z obecných znalostí (princip: jen vlastní data).
  if (chunks.length === 0) {
    return NextResponse.json({
      answer:
        "K tomuto dotazu jsem ve vašich dokumentech ani v majetku nic nenašel.",
      sources: [],
      disclaimer:
        "Asistent odpovídá pouze na základě vašich vlastních dokumentů a majetku.",
    });
  }

  // --- 3) RAG odpověď s citacemi -------------------------------------------
  let result: {
    answer?: string;
    sources?: number[];
    disclaimer?: string;
  } = {};
  try {
    result = await ragAnswer(
      query,
      chunks.map((c) => ({ id: c.id, text: c.text })),
    );
  } catch {
    return NextResponse.json(
      { error: "Asistent je dočasně nedostupný" },
      { status: 502 },
    );
  }

  // Mapuj indexy citací (1-based z ragAnswer) zpět na konkrétní zdroje.
  const citedIdx = Array.isArray(result.sources) ? result.sources : [];
  const cited = citedIdx
    .map((i) => chunks[i - 1]?.source)
    .filter((s): s is Source => Boolean(s));
  // Pokud model neuvedl citace, ukaž alespoň nalezené zdroje (transparentnost).
  const sources = dedupeSources(
    cited.length > 0 ? cited : chunks.map((c) => c.source),
  );

  return NextResponse.json({
    answer:
      typeof result.answer === "string" && result.answer.trim()
        ? result.answer
        : "K tomuto dotazu nemám ve vašich datech jednoznačnou odpověď.",
    sources,
    disclaimer:
      typeof result.disclaimer === "string" && result.disclaimer.trim()
        ? result.disclaimer
        : "Asistent odpovídá pouze na základě vašich vlastních dokumentů a majetku. Nejde o právní radu.",
  });
}

// ---- pomocné typy + funkce -------------------------------------------------
type EmbeddingMatch = {
  id: string;
  document_id: string | null;
  asset_id: string | null;
  chunk_text: string | null;
  metadata: { title?: string; name?: string } | null;
};

function rowToChunk(row: EmbeddingMatch): Chunk | null {
  const text = (row.chunk_text ?? "").trim();
  if (!text) return null;
  const meta = row.metadata ?? {};
  if (row.document_id) {
    const title = meta.title ?? meta.name ?? "Dokument";
    return {
      id: `doc:${row.document_id}`,
      text,
      source: {
        kind: "document",
        id: row.document_id,
        title,
        href: `/dokumenty/${row.document_id}`,
      },
    };
  }
  if (row.asset_id) {
    const title = meta.name ?? meta.title ?? "Položka majetku";
    return {
      id: `asset:${row.asset_id}`,
      text,
      source: {
        kind: "asset",
        id: row.asset_id,
        title,
        href: `/majetek/${row.asset_id}`,
      },
    };
  }
  return null;
}

function dedupeSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of list) {
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
