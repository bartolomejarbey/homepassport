import "server-only";
import OpenAI from "openai";

// Single multimodal provider for extraction / vision / RAG. Swappable via env.
// Keep data in EU: set AI_BASE_URL to an EU endpoint and sign a DPA.
const model = process.env.AI_MODEL ?? "gpt-5.5";
function client() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.AI_BASE_URL || undefined,
  });
}

async function jsonCall(system: string, content: OpenAI.Chat.ChatCompletionContentPart[] | string) {
  const res = await client().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    max_completion_tokens: 2000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: content as any },
    ],
  });
  try { return JSON.parse(res.choices[0]?.message?.content ?? "{}"); }
  catch { return {}; }
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
