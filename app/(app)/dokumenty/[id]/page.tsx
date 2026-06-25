// Detail dokumentu — náhled přes podepsanou URL + AI NÁVRH polí s confidence a
// tlačítky Potvrdit / Odmítnout (server action). Při potvrzení volitelně založí
// připomínku ze záruky (warranty_until) nebo revize (inspection).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, ExternalLink, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { DocExtraction } from "@/lib/ai";

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

type Status = "draft" | "confirmed" | "rejected";
type ExtractionRow = {
  id: string;
  extracted: DocExtraction;
  confidence: number | null;
  status: Status;
  created_at: string;
};

// ---- server actions -------------------------------------------------------

async function rejectExtraction(formData: FormData) {
  "use server";
  const extractionId = String(formData.get("extractionId"));
  const documentId = String(formData.get("documentId"));
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");

  // RLS dovolí update jen u extrakce dokumentu, ke kterému má uživatel přístup.
  await sb
    .from("document_extractions")
    .update({ status: "rejected", reviewed_by: user.id })
    .eq("id", extractionId);
  revalidatePath(`/dokumenty/${documentId}`);
}

async function confirmExtraction(formData: FormData) {
  "use server";
  const extractionId = String(formData.get("extractionId"));
  const documentId = String(formData.get("documentId"));
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");

  const { data: ext } = await sb
    .from("document_extractions")
    .select("id, extracted, document_id")
    .eq("id", extractionId)
    .maybeSingle();

  const { data: doc } = await sb
    .from("documents")
    .select("id, household_id, property_id, category, title")
    .eq("id", documentId)
    .maybeSingle();

  if (!ext || !doc) return;

  await sb
    .from("document_extractions")
    .update({ status: "confirmed", reviewed_by: user.id })
    .eq("id", extractionId);

  // Volitelně založit připomínku z potvrzených dat. Záruka i revize jsou
  // pro vlastníka jen "doporučené" — nikdy netvrdíme, že to ukládá zákon.
  const data = (ext.extracted ?? {}) as DocExtraction;
  if (data.warranty_until) {
    await sb.from("reminders").insert({
      household_id: doc.household_id,
      property_id: doc.property_id,
      document_id: doc.id,
      type: "warranty",
      title: `Konec záruky: ${doc.title ?? "dokument"}`,
      due_date: data.warranty_until,
      wording_type: "recommended",
    });
  } else if (doc.category === "inspection" && data.date) {
    await sb.from("reminders").insert({
      household_id: doc.household_id,
      property_id: doc.property_id,
      document_id: doc.id,
      type: "inspection",
      title: `Další revize: ${doc.title ?? "dokument"}`,
      due_date: data.date,
      wording_type: "recommended",
    });
  }

  revalidatePath(`/dokumenty/${documentId}`);
  revalidatePath("/pripominky");
}

// ---- helpers --------------------------------------------------------------

function fmtConfidence(c: number | null) {
  if (c === null || Number.isNaN(c)) return "neuvedeno";
  return `${Math.round(c * 100)} %`;
}

function confidenceTone(c: number | null) {
  if (c === null) return "draft" as const;
  if (c >= 0.8) return "verified" as const;
  if (c >= 0.5) return "insurance_recommended" as const;
  return "legal_required" as const;
}

const FIELD_LABELS: { key: keyof DocExtraction; label: string }[] = [
  { key: "category", label: "Kategorie" },
  { key: "supplier", label: "Dodavatel" },
  { key: "date", label: "Datum" },
  { key: "amount", label: "Částka" },
  { key: "currency", label: "Měna" },
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
    .select("id, title, category, transferable, mime, file_path, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!doc) notFound();

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
              <p className="text-sm text-muted">
                Pro tento dokument zatím není žádný návrh. Extrakce se spouští po nahrání.
              </p>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2 text-sm">
                  <span className="text-ink-soft">Spolehlivost návrhu:</span>
                  <Badge tone={confidenceTone(latest.confidence)}>
                    {fmtConfidence(latest.confidence)}
                  </Badge>
                </div>

                <dl className="divide-y divide-line">
                  {FIELD_LABELS.map(({ key, label }) => {
                    const value = latest.extracted?.[key];
                    if (value === undefined || value === null || value === "") return null;
                    return (
                      <div key={key} className="flex gap-4 py-2.5">
                        <dt className="w-32 shrink-0 text-sm text-muted">{label}</dt>
                        <dd className="min-w-0 flex-1 text-sm text-ink">{String(value)}</dd>
                      </div>
                    );
                  })}
                </dl>

                <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                  Toto je automatický návrh. Zkontrolujte hodnoty a potvrďte je, nebo
                  návrh odmítněte. Potvrzením se založí připomínka, pokud dokument
                  obsahuje datum konce záruky nebo revize.
                </p>

                {latest.status === "draft" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={confirmExtraction}>
                      <input type="hidden" name="extractionId" value={latest.id} />
                      <input type="hidden" name="documentId" value={doc.id} />
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
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
