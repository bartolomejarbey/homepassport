// Detail položky majetku — fotka (podepsaná URL), základní údaje a akce
// "Odhadnout hodnotu" (hrubý odhad rozsahu přes estimateValue, uložený do
// estimated_value). Dole připojené záruky a dokumenty. Vše česky.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ArrowLeft,
  Package,
  Sparkles,
  Wand2,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { estimateValue } from "@/lib/ai";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Položka majetku — Home Passport" };

type AssetRow = {
  id: string;
  name: string;
  category: string | null;
  room: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  estimated_value: number | null;
  estimated_value_confidence: number | null;
  warranty_until: string | null;
  source: string;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Ručně",
  document: "Z dokumentu",
  photo: "Z fotky",
  ai: "AI návrh",
};

const DOC_CATEGORY_LABEL: Record<string, string> = {
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

function fmtCzk(n: number | null) {
  if (n === null || Number.isNaN(n)) return null;
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(n);
}

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

// ---- server action: hrubý odhad hodnoty ----------------------------------
// Odhad je NÁVRH (rozsah od–do). Ukládáme střed jako orientační hodnotu spolu
// s confidence — nikdy ne jako pevnou cenu.
async function estimateAssetValue(formData: FormData) {
  "use server";
  const assetId = String(formData.get("assetId"));
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");

  // RLS (assets_access) gate — vidíme jen položku vlastní domácnosti.
  const { data: asset } = await sb
    .from("assets")
    .select("id, name, brand, purchase_date")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return;

  let ageYears: number | undefined;
  if (asset.purchase_date) {
    const y = Math.floor(
      (Date.now() - new Date(asset.purchase_date).getTime()) /
        (365.25 * 24 * 3600 * 1000),
    );
    if (Number.isFinite(y) && y >= 0) ageYears = y;
  }

  let est;
  try {
    est = await estimateValue({
      name: asset.name,
      brand: asset.brand ?? undefined,
      age_years: ageYears,
    });
  } catch {
    return;
  }

  const low = typeof est.low === "number" ? est.low : null;
  const high = typeof est.high === "number" ? est.high : null;
  const confidence = typeof est.confidence === "number" ? est.confidence : null;
  const mid =
    low !== null && high !== null
      ? Math.round((low + high) / 2)
      : (high ?? low);
  if (mid === null) return;

  await sb
    .from("assets")
    .update({
      estimated_value: mid,
      estimated_value_confidence: confidence,
    })
    .eq("id", assetId);

  revalidatePath(`/majetek/${assetId}`);
  revalidatePath("/majetek");
}

// ---- page ----------------------------------------------------------------

export default async function MajetekDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await createClient();

  // RLS (assets_access) zaručí přístup jen k vlastní položce.
  const { data: asset } = await sb
    .from("assets")
    .select(
      "id, name, category, room, brand, model, serial, purchase_date, purchase_price, estimated_value, estimated_value_confidence, warranty_until, source, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!asset) notFound();
  const a = asset as AssetRow;

  // Fotky položky → podepsaná URL (TTL 1 h), nikdy syrová cesta.
  const { data: photos } = await sb
    .from("asset_photos")
    .select("id, file_path")
    .eq("asset_id", id)
    .order("created_at", { ascending: true });

  let photoUrl: string | null = null;
  const firstPath = photos?.[0]?.file_path;
  if (firstPath) {
    const { data: signed } = await sb.storage
      .from("assets")
      .createSignedUrl(firstPath, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }

  // Připojené dokumenty (záruky / faktury / návody) — přes documents.asset_id.
  const { data: docsData } = await sb
    .from("documents")
    .select("id, title, category, created_at")
    .eq("asset_id", id)
    .order("created_at", { ascending: false });
  const docs = docsData ?? [];

  const meta: { label: string; value: string }[] = [];
  if (a.category) meta.push({ label: "Kategorie", value: a.category });
  if (a.room) meta.push({ label: "Místnost", value: a.room });
  if (a.brand) meta.push({ label: "Značka", value: a.brand });
  if (a.model) meta.push({ label: "Model", value: a.model });
  if (a.serial) meta.push({ label: "Sériové číslo", value: a.serial });
  if (a.purchase_date)
    meta.push({
      label: "Pořízeno",
      value: new Date(a.purchase_date).toLocaleDateString("cs-CZ"),
    });
  const purchase = fmtCzk(a.purchase_price);
  if (purchase) meta.push({ label: "Pořizovací cena", value: purchase });

  const estimate = fmtCzk(a.estimated_value);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/majetek"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} /> Zpět na majetek
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
            {a.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Přidáno {new Date(a.created_at).toLocaleDateString("cs-CZ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a.source === "photo" ? (
            <Badge tone="insurance_recommended">
              <Sparkles size={11} /> {SOURCE_LABEL[a.source]}
            </Badge>
          ) : (
            <Badge tone="draft">{SOURCE_LABEL[a.source] ?? a.source}</Badge>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Fotka + údaje */}
        <Card className="p-0">
          <div className="border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Package size={16} className="text-honey" /> Položka
            </h2>
          </div>
          <div className="p-5">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={a.name}
                className="mb-4 max-h-72 w-full rounded-md border border-line object-contain bg-surface-2"
              />
            ) : (
              <div className="mb-4 flex h-40 w-full items-center justify-center rounded-md border border-dashed border-line bg-surface-2">
                <Package size={28} className="text-muted" />
              </div>
            )}

            {meta.length === 0 ? (
              <p className="text-sm text-muted">Žádné další údaje.</p>
            ) : (
              <dl className="divide-y divide-line">
                {meta.map(({ label, value }) => (
                  <div key={label} className="flex gap-4 py-2.5">
                    <dt className="w-36 shrink-0 text-sm text-muted">{label}</dt>
                    <dd className="min-w-0 flex-1 text-sm text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </Card>

        {/* Odhad hodnoty */}
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Wand2 size={16} className="text-honey" /> Odhad hodnoty
            </h2>
            {a.estimated_value != null && (
              <Badge tone={confidenceTone(a.estimated_value_confidence)}>
                Spolehlivost {fmtConfidence(a.estimated_value_confidence)}
              </Badge>
            )}
          </div>
          <div className="p-5">
            {a.estimated_value != null ? (
              <>
                <p className="text-sm text-ink-soft">Orientační hodnota</p>
                <p className="mt-1 font-display text-3xl font-semibold text-ink">
                  ~ {estimate}
                </p>
                <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                  Jde o hrubý odhad obvyklé tržní hodnoty použité věci v ČR, ne o
                  znalecký posudek. Slouží jen pro vaši orientaci a soupis majetku.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">
                Hodnota zatím nebyla odhadnuta. Spusťte hrubý odhad podle názvu,
                značky a stáří položky.
              </p>
            )}

            <form action={estimateAssetValue} className="mt-4">
              <input type="hidden" name="assetId" value={a.id} />
              <Button type="submit" variant="honey">
                <Wand2 size={15} />
                {a.estimated_value != null
                  ? "Přepočítat odhad"
                  : "Odhadnout hodnotu"}
              </Button>
            </form>
          </div>
        </Card>
      </div>

      {/* Záruky a dokumenty */}
      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Záruky a dokumenty
        </h2>
        <p className="mb-3 mt-0.5 text-sm text-ink-soft">
          Faktury, návody a záruky připojené k této položce.
        </p>

        {a.warranty_until && (
          <Card className="mb-3 flex items-center gap-3 border-teal/30 bg-teal-100/30 p-4">
            <ShieldCheck size={18} className="shrink-0 text-teal" />
            <p className="text-sm text-ink">
              Záruka do{" "}
              <span className="font-medium">
                {new Date(a.warranty_until).toLocaleDateString("cs-CZ")}
              </span>
            </p>
          </Card>
        )}

        {docs.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              K této položce zatím nejsou připojené žádné dokumenty. Nahrajte
              fakturu nebo návod v sekci{" "}
              <Link
                href="/dokumenty"
                className="font-medium text-navy hover:underline"
              >
                Dokumenty
              </Link>
              .
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id}>
                <Link href={`/dokumenty/${d.id}`} className="block">
                  <Card className="flex items-center gap-4 p-4 transition-colors hover:border-navy/30">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2">
                      <FileText size={18} className="text-honey" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {d.title ?? "Bez názvu"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {new Date(d.created_at).toLocaleDateString("cs-CZ")}
                      </p>
                    </div>
                    <Badge tone="draft">
                      {DOC_CATEGORY_LABEL[d.category] ?? d.category}
                    </Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
