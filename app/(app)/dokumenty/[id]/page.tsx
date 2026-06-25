// Detail dokumentu — náhled přes podepsanou URL + AI NÁVRH polí s confidence a
// tlačítky Potvrdit / Odmítnout (server action). Při potvrzení volitelně založí
// připomínku ze záruky (warranty_until) nebo revize (inspection).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ArrowLeft, ExternalLink, Sparkles, CheckCircle2, XCircle, RefreshCw, Building2, BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { extractDocument, type DocExtraction } from "@/lib/ai";
import { propertyName } from "../../nemovitost/_components/PropertyMeta";
import { DeleteDocumentButton } from "../_components/DeleteDocumentButton";

export const metadata = { title: "Dokument — Home Passport" };

const CATEGORY_LABEL: Record<string, string> = {
  contract: "Smlouva",
  invoice: "Faktura",
  penb: "PENB",
  inspection: "Revizní zpráva",
  manual: "Návod",
  warranty: "Záruka",
  plan: "Plán",
  insurance: "Pojištění",
  other: "Ostatní",
};

// AI vrací kategorii volným textem (a často česky). Na enum sloupec doc_category
// smíme zapsat jen platnou hodnotu — vše ostatní ignorujeme (radši nic než chyba
// nebo smyšlená kategorie). Bezpečně mapujeme jen jednoznačné shody.
const DOC_CATEGORIES = [
  "contract",
  "invoice",
  "penb",
  "inspection",
  "manual",
  "warranty",
  "plan",
  "insurance",
  "other",
] as const;
const CATEGORY_ALIASES: Record<string, (typeof DOC_CATEGORIES)[number]> = {
  smlouva: "contract",
  faktura: "invoice",
  "revizní zpráva": "inspection",
  revize: "inspection",
  záruka: "warranty",
  návod: "manual",
  pojištění: "insurance",
  plán: "plan",
  výkres: "plan",
};
function normalizeCategory(raw: unknown): (typeof DOC_CATEGORIES)[number] | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if ((DOC_CATEGORIES as readonly string[]).includes(v))
    return v as (typeof DOC_CATEGORIES)[number];
  return CATEGORY_ALIASES[v] ?? null;
}

type Status = "draft" | "confirmed" | "rejected";
type ExtractionRow = {
  id: string;
  extracted: DocExtraction;
  // numeric -> z PostgREST přijde jako string; normalizujeme přes toNumber().
  confidence: number | string | null;
  status: Status;
  created_at: string;
};

// ---- server actions -------------------------------------------------------

// Každý vstup ze <form> validujeme Zod (i když RLS chrání data): id z formuláře
// jdou přímo do dotazu na `uuid` sloupec — nevalidní hodnota (prázdno, "undefined")
// by jinak shodila dotaz na „invalid input syntax for type uuid" jako 500.
// Při nevalidním vstupu akce mlčky nic neprovede a stránka se překreslí beze změny.
const uuidSchema = z.string().uuid();

async function rejectExtraction(formData: FormData) {
  "use server";
  const id = uuidSchema.safeParse(formData.get("extractionId"));
  const docId = uuidSchema.safeParse(formData.get("documentId"));
  if (!id.success || !docId.success) return;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");

  // RLS dovolí update jen u extrakce dokumentu, ke kterému má uživatel přístup.
  await sb
    .from("document_extractions")
    .update({ status: "rejected", reviewed_by: user.id })
    .eq("id", id.data);
  revalidatePath(`/dokumenty/${docId.data}`);
  revalidatePath("/dokumenty"); // odznak v seznamu vychází z nejnovější extrakce
}

async function confirmExtraction(formData: FormData) {
  "use server";
  const id = uuidSchema.safeParse(formData.get("extractionId"));
  if (!id.success) return;
  const extractionId = id.data;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");

  // Zdrojem pravdy je extrakce sama (její document_id), ne hidden input z formuláře —
  // jinak by se připomínka mohla navázat na cizí dokument. RLS navíc vrátí jen
  // extrakci dokumentu, ke kterému má uživatel přístup.
  const { data: ext } = await sb
    .from("document_extractions")
    .select("id, extracted, document_id, status")
    .eq("id", extractionId)
    .maybeSingle();
  if (!ext) return;

  const documentId = ext.document_id as string;

  const { data: doc } = await sb
    .from("documents")
    .select("id, household_id, property_id, category, title")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return;

  // Potvrdit lze jen čerstvý koncept. Pokud je už potvrzený (dvojí odeslání) nebo
  // byl mezitím nahrazen novějším návrhem (status 'rejected'), nic neděláme — jinak
  // bychom „oživili" zastaralou extrakci a založili podle ní připomínku.
  if (ext.status !== "draft") {
    revalidatePath(`/dokumenty/${documentId}`);
    return;
  }

  await sb
    .from("document_extractions")
    .update({ status: "confirmed", reviewed_by: user.id })
    .eq("id", extractionId)
    .eq("status", "draft"); // závodní podmínka: potvrď jen pokud je stále koncept

  const data = (ext.extracted ?? {}) as DocExtraction;

  // Potvrzená data se stávají zdrojem pravdy: doplníme jen prázdná/„other" pole
  // dokumentu, nikdy nepřepisujeme to, co uživatel zadal ručně při nahrání.
  const patch: { category?: string } = {};
  const suggested = normalizeCategory(data.category);
  if (suggested && doc.category === "other") patch.category = suggested;
  if (Object.keys(patch).length > 0) {
    await sb.from("documents").update(patch).eq("id", doc.id);
  }

  // Efektivní kategorie po potvrzení (mohli jsme ji právě doplnit z návrhu).
  const effectiveCategory = patch.category ?? doc.category;

  // Volitelně založit připomínku z potvrzených dat — bez duplicit. Záruka i revize
  // jsou pro vlastníka jen "doporučené"; nikdy netvrdíme, že to ukládá zákon.
  // Deduplikace dle document_id + type: potvrzení dalšího návrhu téhož dokumentu
  // (např. po opakované extrakci) už druhou připomínku nevytvoří.
  async function ensureReminder(
    type: "warranty" | "inspection",
    title: string,
    dueDate: string | null,
  ) {
    const { data: existing } = await sb
      .from("reminders")
      .select("id")
      .eq("document_id", doc!.id)
      .eq("type", type)
      .limit(1)
      .maybeSingle();
    if (existing) return; // už existuje — neduplikovat
    await sb.from("reminders").insert({
      household_id: doc!.household_id,
      property_id: doc!.property_id,
      document_id: doc!.id,
      type,
      title,
      due_date: dueDate,
      wording_type: "recommended",
      status: "open",
    });
  }

  if (data.warranty_until && isFutureIsoDate(data.warranty_until)) {
    await ensureReminder(
      "warranty",
      `Konec záruky: ${doc.title ?? "dokument"}`,
      data.warranty_until,
    );
  } else if (effectiveCategory === "inspection") {
    // POCTIVOST: datum na revizní zprávě je datum PROVEDENÍ revize, ne termín
    // další revize. Interval (a tím i další termín) plyne z kontextu nemovitosti,
    // ne z dokumentu — proto due_date necháváme prázdné a uživatele nasměrujeme
    // na výpočet revizí. Žádné smyšlené „další revize do …".
    await ensureReminder(
      "inspection",
      `Zkontrolovat termín další revize: ${doc.title ?? "dokument"}`,
      null,
    );
  }

  revalidatePath(`/dokumenty/${documentId}`);
  revalidatePath("/dokumenty"); // odznak „Potvrzeno" + případně nová kategorie
  revalidatePath("/pripominky"); // mohla vzniknout připomínka ze záruky/revize
  revalidatePath("/prehled"); // dlaždice na dashboardu
}

// Smazání dokumentu — odstraní soubor z úložiště i řádek (extrakce a připomínky
// padají kaskádou dle FK). Vrací uživatele na seznam. RLS hlídá, že maže jen
// vlastní dokument; když na něj nemá právo, select níže vrátí null a nic se nestane.
async function deleteDocument(formData: FormData) {
  "use server";
  const id = uuidSchema.safeParse(formData.get("documentId"));
  if (!id.success) redirect("/dokumenty"); // nevalidní vstup — prostě zpět na seznam
  const documentId = id.data;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");

  const { data: doc } = await sb
    .from("documents")
    .select("id, file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) redirect("/dokumenty"); // neexistuje nebo bez práv — prostě zpět

  // Nejdřív soubor z úložiště (ať nezůstane viset), pak řádek. Pokud smazání
  // souboru selže, řádek raději ponecháme, ať detail nezůstane bez podkladu.
  const { error: rmErr } = await sb.storage.from("documents").remove([doc.file_path]);
  if (rmErr) return; // tichá chyba — uživatel může zkusit znovu

  await sb.from("documents").delete().eq("id", doc.id);

  revalidatePath("/dokumenty");
  revalidatePath("/pripominky"); // navázané připomínky zmizely
  revalidatePath("/prehled");
  redirect("/dokumenty");
}

// Re-spuštění AI extrakce z detailu (když po nahrání selhala nebo byl návrh odmítnut).
async function runExtraction(formData: FormData) {
  "use server";
  const id = uuidSchema.safeParse(formData.get("documentId"));
  if (!id.success) return;
  const documentId = id.data;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");

  const { data: doc } = await sb
    .from("documents")
    .select("id, file_path, mime")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return;

  const { data: blob } = await sb.storage.from("documents").download(doc.file_path);
  if (!blob) return;

  const mime = doc.mime || blob.type || "application/octet-stream";
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;

  let extracted: DocExtraction;
  try {
    extracted = await extractDocument(dataUrl);
  } catch {
    return; // ticho: stránka se znovu vykreslí beze změny, uživatel může zkusit znovu
  }

  const confidence =
    typeof extracted.confidence === "number" ? extracted.confidence : null;

  // Nový návrh nahrazuje starý: případné dosud nevyřízené koncepty téhož dokumentu
  // označíme jako odmítnuté, ať se nehromadí neviditelné duplicitní návrhy.
  await sb
    .from("document_extractions")
    .update({ status: "rejected", reviewed_by: user.id })
    .eq("document_id", doc.id)
    .eq("status", "draft");

  await sb.from("document_extractions").insert({
    document_id: doc.id,
    extracted,
    confidence,
    // Provenance odpovídá skutečně použitému poskytovateli (přepínatelnému přes env).
    provider: process.env.AI_PROVIDER ?? "openai",
    model: process.env.AI_MODEL ?? "gpt-5.5",
    status: "draft",
  });

  revalidatePath(`/dokumenty/${documentId}`);
  revalidatePath("/dokumenty"); // nový návrh -> odznak v seznamu
}

// ---- helpers --------------------------------------------------------------

// Připomínku zakládáme jen pro datum, které dává smysl (dnes nebo v budoucnu).
// Minulé „záruka do" je už prošlá — nemá smysl na ni upozorňovat termínem.
function isFutureIsoDate(value: string): boolean {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return t >= today.getTime();
}

// Postgres `numeric` přijde z PostgREST jako string ("0.82"), ne number — TS typ
// number tu lže. Sjednotíme na číslo na hranici, ať Math.round / porovnání i
// Number.isNaN fungují spolehlivě (na stringu vrací isNaN vždy false).
function toNumber(c: number | string | null): number | null {
  if (c === null || c === undefined) return null;
  const n = typeof c === "number" ? c : Number(c);
  return Number.isFinite(n) ? n : null;
}

function fmtConfidence(c: number | string | null) {
  const n = toNumber(c);
  if (n === null) return "neuvedeno";
  return `${Math.round(n * 100)} %`;
}

// Tón čistě informativní (spolehlivost návrhu), NE wording_type. Záměrně se vyhne
// červenému „legal_required" tónu — ten patří jen zákonné povinnosti, ne nízké
// jistotě AI, aby badge nelhal o významu.
function confidenceTone(c: number | string | null) {
  const n = toNumber(c);
  if (n === null) return "draft" as const;
  if (n >= 0.8) return "verified" as const;
  if (n >= 0.5) return "insurance_recommended" as const;
  return "draft" as const;
}

// Datum z AI je ISO řetězec ("2025-06-01"); zobrazíme ho česky. Když to není
// platné datum, vrátíme původní hodnotu (radši cokoli než prázdno nebo „Invalid").
function fmtIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value.trim();
  return new Date(t).toLocaleDateString("cs-CZ");
}

// Pole z návrhu zobrazujeme uhlazeně: kategorii přeložíme do češtiny, data
// lokalizujeme, částku spojíme s měnou. `currency` se ukáže jen jako součást
// částky (vlastní řádek „Měna" by byl nadbytečný), proto ho v mapě vynecháme.
function formatField(
  key: keyof DocExtraction,
  data: DocExtraction,
): string | null {
  const value = data[key];
  if (value === undefined || value === null || value === "") return null;

  if (key === "category") {
    const norm = normalizeCategory(value);
    return norm ? CATEGORY_LABEL[norm] : String(value);
  }
  if (key === "date" || key === "warranty_until") {
    return fmtIsoDate(value);
  }
  if (key === "amount") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    const formatted = new Intl.NumberFormat("cs-CZ").format(n);
    const currency =
      typeof data.currency === "string" && data.currency.trim()
        ? ` ${data.currency.trim()}`
        : "";
    return `${formatted}${currency}`;
  }
  return String(value);
}

// „Měna" nemá vlastní řádek — je už součástí „Částka". Ostatní pole v pořadí,
// v jakém je chceme číst (od identifikace dokladu po shrnutí).
const FIELD_LABELS: { key: keyof DocExtraction; label: string }[] = [
  { key: "category", label: "Kategorie" },
  { key: "supplier", label: "Dodavatel" },
  { key: "date", label: "Datum" },
  { key: "amount", label: "Částka" },
  { key: "warranty_until", label: "Záruka do" },
  { key: "inspection_no", label: "Číslo revize" },
  { key: "summary", label: "Shrnutí" },
];

// ---- page -----------------------------------------------------------------

export default async function DokumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await createClient();

  const { data: doc } = await sb
    .from("documents")
    .select(
      "id, title, category, transferable, mime, file_path, created_at, property_id, properties(id, title, type, street, city)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!doc) notFound();

  // Vnořená nemovitost přijde jako pole (embed). RLS zaručí, že ji vidíme jen
  // pokud k ní máme přístup — jinak je null a propojení prostě nezobrazíme.
  const propRaw = Array.isArray(doc.properties) ? doc.properties[0] : doc.properties;
  const linkedProperty =
    (propRaw as { id: string; title: string | null; type: string; street: string | null; city: string | null } | null) ??
    null;

  // Podepsaná URL (TTL 1 h) — nikdy nevystavujeme syrovou cestu v úložišti.
  const { data: signed } = await sb.storage
    .from("documents")
    .createSignedUrl(doc.file_path, 3600);
  const previewUrl = signed?.signedUrl ?? null;
  const isImage = (doc.mime ?? "").startsWith("image/");

  const { data: extractionsData } = await sb
    .from("document_extractions")
    .select("id, extracted, confidence, status, created_at")
    .eq("document_id", id)
    .order("created_at", { ascending: false });
  const extractions = (extractionsData as ExtractionRow[] | null) ?? [];
  const latest = extractions[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dokumenty"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} /> Zpět na dokumenty
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
            {doc.title ?? "Bez názvu"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Nahráno {new Date(doc.created_at).toLocaleDateString("cs-CZ")}
          </p>
          {linkedProperty && (
            <Link
              href={`/nemovitost/${linkedProperty.id}`}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-navy transition-colors hover:underline"
            >
              <Building2 size={14} /> {propertyName(linkedProperty)}
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc.transferable && <Badge tone="recommended">K nemovitosti</Badge>}
          <Badge tone="draft">{CATEGORY_LABEL[doc.category] ?? doc.category}</Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Náhled */}
        <Card className="p-0">
          <div className="border-b border-line px-5 py-3">
            <h2 className="font-display text-base font-semibold text-ink">Náhled</h2>
          </div>
          <div className="p-5">
            {!previewUrl ? (
              <p className="text-sm text-muted">Náhled není k dispozici.</p>
            ) : isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={doc.title ?? "Náhled dokumentu"}
                className="max-h-[480px] w-full rounded-md border border-line object-contain"
              />
            ) : (
              <object
                data={previewUrl}
                type={doc.mime ?? "application/pdf"}
                className="h-[480px] w-full rounded-md border border-line"
              >
                <p className="text-sm text-muted">Náhled nelze zobrazit.</p>
              </object>
            )}
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"
              >
                <ExternalLink size={14} /> Otevřít v novém okně
              </a>
            )}
          </div>
        </Card>

        {/* AI návrh */}
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Sparkles size={16} className="text-honey" /> Návrh dat z dokumentu
            </h2>
            {latest && latest.status === "draft" && (
              <Badge tone="insurance_recommended">Návrh</Badge>
            )}
            {latest && latest.status === "confirmed" && (
              <Badge tone="verified">Potvrzeno</Badge>
            )}
            {latest && latest.status === "rejected" && (
              <Badge tone="draft">Odmítnuto</Badge>
            )}
          </div>

          <div className="p-5">
            {!latest ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Pro tento dokument zatím není žádný návrh. Extrakce se obvykle spustí
                  hned po nahrání — pokud se nepovedla, spusťte ji ručně.
                </p>
                <form action={runExtraction}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <Button type="submit" variant="honey">
                    <Sparkles size={15} /> Navrhnout data z dokumentu
                  </Button>
                </form>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2 text-sm">
                  <span className="text-ink-soft">Spolehlivost návrhu:</span>
                  <Badge tone={confidenceTone(latest.confidence)}>
                    {fmtConfidence(latest.confidence)}
                  </Badge>
                </div>

                {(() => {
                  const rows = FIELD_LABELS.map(({ key, label }) => ({
                    label,
                    display: latest.extracted
                      ? formatField(key, latest.extracted)
                      : null,
                  })).filter((r) => r.display);
                  // AI mohla vrátit prázdno (nečitelný sken, jen confidence). Místo
                  // prázdného seznamu to řekneme narovinu a nabídneme nový pokus.
                  if (rows.length === 0) {
                    return (
                      <p className="text-sm text-muted">
                        Z tohoto dokumentu se nepodařilo vyčíst žádná konkrétní data —
                        sken může být nečitelný nebo dokument neobsahuje rozpoznatelné
                        položky. Můžete návrh odmítnout a vytvořit nový.
                      </p>
                    );
                  }
                  return (
                    <dl className="divide-y divide-line">
                      {rows.map((r) => (
                        <div key={r.label} className="flex gap-4 py-2.5">
                          <dt className="w-32 shrink-0 text-sm text-muted">{r.label}</dt>
                          <dd className="min-w-0 flex-1 text-sm text-ink">{r.display}</dd>
                        </div>
                      ))}
                    </dl>
                  );
                })()}

                <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                  Toto je automatický návrh. Zkontrolujte hodnoty a potvrďte je, nebo
                  návrh odmítněte. Pokud dokument obsahuje budoucí konec záruky, potvrzením
                  se k němu založí připomínka. U revizní zprávy termín další revize plyne
                  z kontextu nemovitosti — spočítáte ho v sekci{" "}
                  <Link href="/pripominky" className="font-medium text-navy hover:underline">
                    Připomínky
                  </Link>
                  .
                </p>

                {latest.status === "draft" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={confirmExtraction}>
                      <input type="hidden" name="extractionId" value={latest.id} />
                      <Button type="submit" variant="primary">
                        <CheckCircle2 size={15} /> Potvrdit
                      </Button>
                    </form>
                    <form action={rejectExtraction}>
                      <input type="hidden" name="extractionId" value={latest.id} />
                      <input type="hidden" name="documentId" value={doc.id} />
                      <Button type="submit" variant="ghost">
                        <XCircle size={15} /> Odmítnout
                      </Button>
                    </form>
                  </div>
                )}

                {latest.status === "confirmed" && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <p className="flex items-center gap-1.5 text-sm text-teal">
                      <CheckCircle2 size={15} /> Data jste potvrdili.
                    </p>
                    <Link
                      href="/pripominky"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"
                    >
                      <BellRing size={14} /> Přejít na připomínky
                    </Link>
                  </div>
                )}

                {latest.status === "rejected" && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm text-muted">
                      Tento návrh jste odmítli. Můžete nechat vytvořit nový.
                    </p>
                    <form action={runExtraction}>
                      <input type="hidden" name="documentId" value={doc.id} />
                      <Button type="submit" variant="ghost">
                        <RefreshCw size={15} /> Navrhnout znovu
                      </Button>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Správa dokumentu */}
      <Card className="flex flex-wrap items-center justify-between gap-3 border-rust-100">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Smazat dokument
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Trvale odstraní soubor z úložiště i všechna navržená data. Tuto akci nelze vrátit zpět.
          </p>
        </div>
        <DeleteDocumentButton documentId={doc.id} action={deleteDocument} />
      </Card>
    </div>
  );
}
