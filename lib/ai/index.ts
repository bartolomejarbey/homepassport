import "server-only";
import OpenAI from "openai";
import { parseJsonObject } from "./parse";

// Single multimodal provider for extraction / vision / RAG. Swappable via env.
// Keep data in EU: set AI_BASE_URL to an EU endpoint and sign a DPA.
const model = process.env.AI_MODEL ?? "gpt-5.5";

// Hard per-request timeout for every provider call. Without this the SDK would
// wait on a hung connection indefinitely, holding the route open and blocking
// the user (the upload/asset is best-effort, so a stuck AI call must fail fast
// and let the route return a clean error). Tunable via env for slower models /
// regions; clamped to a sane floor so it can't be set absurdly low. `maxRetries`
// is bounded to 1: this is a cost-sensitive path, so we retry once on a
// transient network blip but never fan out into many paid attempts.
const AI_TIMEOUT_MS = (() => {
  const raw = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 1000 ? raw : 30_000;
})();

function client() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.AI_BASE_URL || undefined,
    timeout: AI_TIMEOUT_MS,
    maxRetries: 1,
  });
}

// Returns `any` on purpose: the typed wrappers below (extractDocument, …) narrow
// the model's free-form JSON to their own shapes, exactly as the previous inline
// `JSON.parse(...)` (which is `any`) allowed. parseJsonObject itself stays
// `unknown` so the pure fallback can be tested without loosening this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function jsonCall(system: string, content: OpenAI.Chat.ChatCompletionContentPart[] | string): Promise<any> {
  const res = await client().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    max_completion_tokens: 2000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: content as any },
    ],
  });
  return parseJsonObject(res.choices[0]?.message?.content);
}

export interface DocExtraction {
  category?: string; supplier?: string; date?: string; amount?: number;
  currency?: string; warranty_until?: string; inspection_no?: string;
  summary?: string; confidence?: number;
}

/** Read a document (image/PDF page as data URL) → structured draft fields. */
export async function extractDocument(dataUrl: string): Promise<DocExtraction> {
  return jsonCall(
    "Jsi asistent pro čtení českých dokumentů (faktury, smlouvy, revizní zprávy, záruky). " +
    "Vrať JSON: {category, supplier, date(ISO), amount(number), currency, warranty_until(ISO), inspection_no, summary, confidence(0-1)}. " +
    "Nehádej; chybějící pole vynech. Vždy uveď confidence.",
    [{ type: "text", text: "Vytáhni strukturovaná data z dokumentu." },
     { type: "image_url", image_url: { url: dataUrl } }],
  );
}

export interface AssetGuess { name?: string; category?: string; brand?: string; model?: string; confidence?: number; }
/** Recognise an item from a photo → draft asset. */
export async function recognizeAsset(dataUrl: string): Promise<AssetGuess> {
  return jsonCall(
    "Rozpoznej hlavní předmět/vybavení na fotce. Vrať JSON {name, category, brand, model, confidence(0-1)} česky.",
    [{ type: "text", text: "Co je na fotce? Navrhni položku majetku." },
     { type: "image_url", image_url: { url: dataUrl } }],
  );
}

/** Rough value estimate (range), explicitly an estimate. */
export async function estimateValue(a: { name: string; brand?: string; age_years?: number }):
  Promise<{ low?: number; high?: number; currency?: string; confidence?: number }> {
  return jsonCall(
    "Odhadni tržní hodnotu použité věci v ČR. Vrať JSON {low, high, currency:'CZK', confidence(0-1)}. Je to hrubý odhad.",
    JSON.stringify(a),
  );
}

/** Embedding for RAG search. */
export async function embed(text: string): Promise<number[]> {
  const r = await client().embeddings.create({ model: "text-embedding-3-small", input: text });
  return r.data[0].embedding;
}

/** Answer a question grounded in the user's own document chunks (with citation). */
export async function ragAnswer(question: string, chunks: { id: string; text: string }[]) {
  const ctx = chunks.map((c, i) => `[${i + 1}] (${c.id}) ${c.text}`).join("\n");
  return jsonCall(
    "Odpověz na dotaz POUZE z poskytnutých úryvků uživatelových dokumentů. " +
    "Vrať JSON {answer, sources:[index], disclaimer}. Pokud odpověď v podkladech není, řekni to. " +
    "Nikdy nedávej právní radu bez disclaimeru.",
    `Dotaz: ${question}\n\nÚryvky:\n${ctx}`,
  );
}
