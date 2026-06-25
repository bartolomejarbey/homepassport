// POST /api/ai/search — přirozený dotaz NAD VLASTNÍMI daty uživatele.
// 1) embed(dotaz) → 2) najdi nejbližší úryvky pro domácnost (pgvector cosine přes RPC,
//    fallback: textové hledání nad embeddings.chunk_text → documents/extractions/assets)
// 3) ragAnswer() s citacemi. Nikdy neodpovídá mimo data uživatele: bez podkladů
//    vrátíme prázdnou odpověď. Veškeré dotazy běží pod RLS přihlášeného uživatele.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { embed, ragAnswer } from "@/lib/ai";

const Body = z.object({ query: z.string().trim().min(2).max(500) });

// Zdroj citace odkazuje zpět na konkrétní dokument, položku majetku nebo
// připomínku (revize/záruka). Detail se otevře na příslušné stránce.
type Source = {
  kind: "document" | "asset" | "reminder";
  id: string;
  title: string;
  href: string;
};
type Chunk = { id: string; text: string; source: Source };

const MAX_CHUNKS = 8;
// Širší okno kandidátů pro potvrzené extrakce: relevanci dle dotazu filtrujeme
// v JS (obsah je jsonb), tak ať máme z čeho vybírat i mimo nejnovějších MAX_CHUNKS.
const EXTRACTION_CANDIDATES = 40;
const DISCLAIMER =
  "Asistent odpovídá pouze na základě vašich vlastních dokumentů a majetku. Nejde o právní radu.";

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
      answer:
        "Zatím nemáte žádnou domácnost s daty, ve kterých bych mohl hledat. Až nahrajete dokumenty nebo přidáte majetek, vrátím se k vašemu dotazu.",
      sources: [],
      disclaimer: DISCLAIMER,
    });
  }

  let chunks: Chunk[] = [];

  // Má domácnost vůbec nějaké embeddings? Zjistíme to jedním levným dotazem.
  // Když ne (typický stav, dokud nepoběží indexace), přeskočíme drahé embedování
  // dotazu i RPC a rovnou jdeme na textový fallback. Šetří to API volání i latenci
  // a nespoléháme na RPC, které v nasazení nemusí existovat.
  const { count: embCount } = await sb
    .from("embeddings")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  const hasEmbeddings = (embCount ?? 0) > 0;

  // --- 1) Sémantické vyhledávání přes pgvector (cosine, RPC) -----------------
  // RPC match_embeddings je SECURITY INVOKER → respektuje RLS domácnosti.
  // Pokud RPC v nasazení neexistuje, vrátí chybu a my spadneme na fallback níže.
  if (hasEmbeddings) {
    try {
      const queryEmbedding = await embed(query);
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
  }

  // --- 2) Fallback A: textové hledání přímo nad embeddings.chunk_text --------
  // Spustí se, když RPC chybí, ale embeddings (úryvky textu) už existují —
  // tak dáme RAG kroku skutečný obsah dokumentů, ne jen názvy.
  if (chunks.length === 0 && hasEmbeddings) {
    const like = ilikePattern(query);
    if (like) {
      const { data: rows } = await sb
        .from("embeddings")
        .select("id, document_id, asset_id, chunk_text, metadata")
        .eq("household_id", householdId)
        .ilike("chunk_text", like)
        .limit(MAX_CHUNKS);
      chunks = (rows ?? [])
        .map((r) => rowToChunk(r as EmbeddingMatch))
        .filter((c): c is Chunk => c !== null);
    }
  }

  // --- 3) Fallback B: ILIKE nad documents (+ extrakce) a assets -------------
  // Poslední záchrana, když ještě nejsou žádné embeddings — hledáme v názvech
  // a ve strukturovaných výtazích dokumentů, plus v polích majetku.
  if (chunks.length === 0) {
    chunks = await textSearch(sb, householdId, query);
  }

  // Žádné podklady → neodpovídáme z obecných znalostí (princip: jen vlastní data).
  if (chunks.length === 0) {
    return NextResponse.json({
      answer:
        "K tomuto dotazu jsem ve vašich dokumentech ani v majetku nic nenašel. Zkuste dotaz přeformulovat, nebo nejdřív nahrajte příslušný dokument.",
      sources: [],
      disclaimer: DISCLAIMER,
    });
  }

  // --- 4) RAG odpověď s citacemi -------------------------------------------
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
    // Sumarizátor je nedostupný (např. výpadek AI), ale relevantní záznamy jsme
    // našli. Místo slepé chyby vrátíme alespoň nalezené zdroje s odkazy — hledání
    // tak zůstane užitečné i bez AI shrnutí.
    return NextResponse.json({
      answer:
        "Souhrn od asistenta je teď nedostupný, ale ve vašich datech jsem našel tyto relevantní záznamy:",
      sources: dedupeSources(chunks.map((c) => c.source)),
      disclaimer: DISCLAIMER,
    });
  }

  // Mapuj indexy citací (1-based z ragAnswer) zpět na konkrétní zdroje.
  // Model je nedůvěryhodný vstup: indexy ověříme jako celá čísla v rozsahu,
  // ať náhodný/halucinovaný index nepadne na nesprávný zdroj.
  const citedIdx = Array.isArray(result.sources) ? result.sources : [];
  const cited = citedIdx
    .map((i) => {
      const n = Math.trunc(Number(i));
      return Number.isInteger(n) && n >= 1 && n <= chunks.length
        ? chunks[n - 1]?.source
        : undefined;
    })
    .filter((s): s is Source => Boolean(s));
  // Pokud model neuvedl citace, ukaž alespoň nalezené zdroje (transparentnost).
  const sources = dedupeSources(
    cited.length > 0 ? cited : chunks.map((c) => c.source),
  );

  // Disclaimer NEbereme od modelu — držíme vlastní, čestnou a předvídatelnou
  // formulaci (princip: jen vlastní data, nejde o právní radu). Model by mohl
  // disclaimer vynechat nebo přeformulovat zavádějícím způsobem.
  return NextResponse.json({
    answer:
      typeof result.answer === "string" && result.answer.trim()
        ? result.answer.trim()
        : "K tomuto dotazu nemám ve vašich datech jednoznačnou odpověď.",
    sources,
    disclaimer: DISCLAIMER,
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

type SupaClient = Awaited<ReturnType<typeof createClient>>;

// Vytvoř bezpečný ILIKE vzor: escapuj zástupné znaky a odstraň znaky, které
// rozbíjejí PostgREST `.or(...)` filtr (čárky a závorky fungují jako oddělovače).
function ilikePattern(q: string): string | null {
  const safe = q
    .replace(/[%_\\]/g, (m) => `\\${m}`)
    .replace(/[(),]/g, " ")
    .trim();
  return safe ? `%${safe}%` : null;
}

// Textový fallback nad documents (+ výtahy z extrakcí) a assets.
async function textSearch(
  sb: SupaClient,
  householdId: string,
  query: string,
): Promise<Chunk[]> {
  const like = ilikePattern(query);
  if (!like) return [];
  const half = Math.ceil(MAX_CHUNKS / 2);
  // Klíčová slova dotazu (≥3 znaky) pro relevanci výtahů z extrakcí.
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
  const out: Chunk[] = [];
  const seenDocs = new Set<string>();

  const [docsRes, extrRes, assetsRes, remindersRes] = await Promise.all([
    sb
      .from("documents")
      .select("id, title, category")
      .eq("household_id", householdId)
      .ilike("title", like)
      .limit(half),
    // Výtahy z dokumentů (souhrn) — sem se ukládá AI extrakce s reálným obsahem.
    // Bereme jen potvrzené (uživatel je odsouhlasil) a od nejnovějších. Relevanci
    // dle dotazu vyhodnotíme níže v JS (extracted je jsonb), proto si bereme širší
    // okno kandidátů než MAX_CHUNKS — jinak by relevantní, ale starší výtah vypadl.
    sb
      .from("document_extractions")
      .select("document_id, extracted, created_at, documents!inner(id, title, household_id)")
      .eq("documents.household_id", householdId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(EXTRACTION_CANDIDATES),
    sb
      .from("assets")
      .select("id, name, brand, model, room, category")
      .eq("household_id", householdId)
      // pole spojíme přes OR; vzor `like` je už zbavený čárek a závorek.
      .or(
        `name.ilike.${like},brand.ilike.${like},model.ilike.${like},room.ilike.${like}`,
      )
      .limit(half),
    // Otevřené připomínky (revize, záruky, servis) — odpovídají na „kdy mám…",
    // „mám revizi…". Wording si neseme čestně dle wording_type (viz remindersToChunks).
    sb
      .from("reminders")
      .select("id, type, title, due_date, wording_type, legal_basis, status")
      .eq("household_id", householdId)
      .eq("status", "open")
      .ilike("title", like)
      .limit(half),
  ]);

  // Pořadí dle bohatosti obsahu: extrakce (reálná data z dokumentů) → připomínky
  // → dokumenty podle názvu → majetek. Při ořezu na MAX_CHUNKS tak zůstanou
  // nejvíce odpovídající úryvky, ne jen shody v názvu.
  let extractionHits = 0;
  for (const e of extrRes.data ?? []) {
    // Z širšího okna kandidátů vybíráme nejvýše MAX_CHUNKS relevantních výtahů,
    // ať extrakce nezaberou celý výsledek a zůstane místo na připomínky/majetek.
    if (extractionHits >= MAX_CHUNKS) break;
    // Vnořený vztah může přijít jako objekt nebo jednoprvkové pole — ošetříme obojí.
    const rel = (e as { documents?: unknown }).documents;
    const doc = (Array.isArray(rel) ? rel[0] : rel) as
      | { id?: string; title?: string }
      | undefined;
    const docId = doc?.id ?? e.document_id;
    if (!docId || seenDocs.has(docId)) continue;
    const summary = summarizeExtraction(e.extracted);
    if (!summary) continue;
    // Relevance: zařaď výtah jen pokud obsahuje aspoň jedno klíčové slovo dotazu
    // (nebo dotaz nemá žádné delší slovo). Jinak bychom do RAG cpali náhodné dokumenty.
    if (terms.length > 0) {
      const hay = summary.toLowerCase();
      if (!terms.some((t) => hay.includes(t))) continue;
    }
    seenDocs.add(docId);
    extractionHits += 1;
    const title = doc?.title ?? "Dokument";
    out.push({
      id: `doc:${docId}`,
      text: `Z dokumentu „${title}": ${summary}`,
      source: { kind: "document", id: docId, title, href: `/dokumenty/${docId}` },
    });
  }

  for (const r of (remindersRes.data ?? []) as ReminderRow[]) {
    out.push(reminderToChunk(r));
  }

  for (const d of docsRes.data ?? []) {
    if (seenDocs.has(d.id)) continue;
    seenDocs.add(d.id);
    const title = d.title ?? "Dokument";
    out.push({
      id: `doc:${d.id}`,
      text: `Dokument „${title}" (kategorie: ${d.category}).`,
      source: { kind: "document", id: d.id, title, href: `/dokumenty/${d.id}` },
    });
  }

  for (const a of assetsRes.data ?? []) {
    const parts = [a.brand, a.model, a.room ? `místnost ${a.room}` : null]
      .filter(Boolean)
      .join(", ");
    out.push({
      id: `asset:${a.id}`,
      text: `Položka majetku „${a.name}"${parts ? ` (${parts})` : ""}.`,
      source: { kind: "asset", id: a.id, title: a.name, href: `/majetek/${a.id}` },
    });
  }

  return out.slice(0, MAX_CHUNKS);
}

// Připomínka → citovatelný úryvek. Wording neseme ČESTNĚ dle wording_type:
// jen 'legal_required' smí znít jako povinnost ze zákona. Tím dáme RAG kroku
// pravdivý podklad a nesvádíme model k vymýšlení právních povinností.
type ReminderRow = {
  id: string;
  type: string | null;
  title: string;
  due_date: string | null;
  wording_type: "legal_required" | "recommended" | "insurance_recommended";
  legal_basis: string | null;
  status: string | null;
};

const WORDING_LABEL: Record<ReminderRow["wording_type"], string> = {
  legal_required: "povinné ze zákona",
  recommended: "doporučené (bezpečnost a životnost)",
  insurance_recommended: "doporučené kvůli pojišťovně",
};

function reminderToChunk(r: ReminderRow): Chunk {
  const bits: string[] = [`Připomínka „${r.title}"`];
  if (r.due_date) bits.push(`termín ${r.due_date}`);
  bits.push(`charakter: ${WORDING_LABEL[r.wording_type] ?? "doporučené"}`);
  if (r.wording_type === "legal_required" && r.legal_basis)
    bits.push(`právní základ: ${r.legal_basis}`);
  return {
    id: `reminder:${r.id}`,
    text: bits.join("; ") + ".",
    source: { kind: "reminder", id: r.id, title: r.title, href: "/pripominky" },
  };
}

// Z extrakce (jsonb) sestav stručný, citovatelný text — jen pole, která dávají
// smysl jako odpověď. Vrací null, pokud výtah nic užitečného neobsahuje.
function summarizeExtraction(extracted: unknown): string | null {
  if (!extracted || typeof extracted !== "object") return null;
  const e = extracted as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof e.summary === "string" && e.summary.trim()) parts.push(e.summary.trim());
  if (typeof e.supplier === "string" && e.supplier.trim())
    parts.push(`dodavatel ${e.supplier.trim()}`);
  if (typeof e.amount === "number")
    parts.push(`částka ${e.amount} ${typeof e.currency === "string" ? e.currency : "Kč"}`);
  if (typeof e.warranty_until === "string" && e.warranty_until.trim())
    parts.push(`záruka do ${e.warranty_until}`);
  if (typeof e.inspection_no === "string" && e.inspection_no.trim())
    parts.push(`číslo revize ${e.inspection_no}`);
  if (typeof e.date === "string" && e.date.trim()) parts.push(`datum ${e.date}`);
  return parts.length ? parts.join("; ") + "." : null;
}

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
