// /prevzit/[token] — veřejná (token-based) stránka pro převzetí pasu nemovitosti.
// Zobrazí jen PŘENOSNOU vrstvu nemovitosti (adresa, typ, kontext systémů, sekce
// pasu, počet přenosných dokumentů) — NIKDY osobní data prodávajícího. Token je
// nositelem oprávnění, proto čteme adminem (kupující ještě nemá RLS přístup).
// Přihlášený uživatel může nemovitost převzít (POST /api/handover/accept),
// nepřihlášený je vyzván k registraci s tokenem neseným v ?next.
import Link from "next/link";
import {
  ArrowRightLeft,
  ShieldCheck,
  Lock,
  MapPin,
  Clock,
  AlertCircle,
  FileText,
  Home,
  CalendarClock,
  ExternalLink,
  ShieldQuestion,
  BadgeCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DownloadAll } from "./_components/DownloadAll";

export const metadata = { title: "Převzetí pasu nemovitosti — Home Passport" };

type Params = { token: string };

const TYPE_LABELS: Record<string, string> = {
  house: "Rodinný dům",
  apartment: "Byt",
  unit: "Jednotka",
  land: "Pozemek",
  commercial: "Komerční prostor",
};

const KIND_LABELS: Record<string, string> = {
  construction: "Konstrukce",
  technology: "Technologie",
  penb: "PENB",
  inspections: "Revize",
  warranties: "Záruky",
  manuals: "Návody",
  equipment: "Vybavení",
};

const DOC_CATEGORY_LABELS: Record<string, string> = {
  contract: "Smlouva",
  invoice: "Faktura",
  penb: "PENB",
  inspection: "Revizní zpráva",
  manual: "Návod",
  warranty: "Záruka",
  plan: "Plán",
  insurance: "Pojištění",
  other: "Dokument",
};

function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Krátká přípona z původní úložné cesty (na nahrání zůstává zachována:
// <household>/<uuid>-<jméno.ext>). Slouží jako záloha, když ji název dokumentu
// ztratil (uživatel ho v aplikaci přejmenoval) — jinak by stažený soubor neměl
// příponu a OS by ho neuměl otevřít.
function extFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  const ext = base.slice(dot + 1);
  // Jen rozumné přípony (alfanumerické, max 8 znaků) — nic, co by mátlo prohlížeč.
  return /^[a-z0-9]{1,8}$/i.test(ext) ? ext.toLowerCase() : "";
}

// Bezpečný název souboru pro hlavičku Content-Disposition v podepsané URL. Pokud
// název dokumentu nemá příponu, doplníme ji z původní cesty, aby se stažený
// soubor uložil s funkční koncovkou (např. .pdf), ne jako neotevíratelný soubor.
function safeFileName(
  title: string | null,
  category: string,
  id: string,
  filePath: string,
): string {
  const base = (title && title.trim()) || DOC_CATEGORY_LABELS[category] || "dokument";
  const cleaned =
    base.replace(/[^\w.\-áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ ]+/g, "").trim() ||
    `dokument-${id.slice(0, 8)}`;
  const ext = extFromPath(filePath);
  if (ext && !cleaned.toLowerCase().endsWith(`.${ext}`)) {
    return `${cleaned}.${ext}`;
  }
  return cleaned;
}

function propertyName(p: {
  title: string | null;
  type: string;
  street: string | null;
  city: string | null;
}): string {
  if (p.title && p.title.trim()) return p.title.trim();
  const typeLabel = TYPE_LABELS[p.type] ?? "Nemovitost";
  const where = [p.street, p.city].filter(Boolean).join(", ");
  return where ? `${typeLabel} — ${where}` : typeLabel;
}

// Sdílený rám: hlavička v navy + obsah, ať i chybové stavy působí brandově.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper">
      <div className="border-b border-line bg-navy text-paper">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <ArrowRightLeft size={18} className="text-honey" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Home Passport
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">{children}</div>
    </main>
  );
}

// Jednotná chybová obrazovka pro neplatné / vypršelé / zrušené pozvánky.
function InvalidState({ title, hint }: { title: string; hint: string }) {
  return (
    <Shell>
      <div className="card flex flex-col items-center gap-2 p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-rust-100">
          <AlertCircle size={22} className="text-rust" />
        </span>
        <h1 className="mt-1 text-xl text-ink">{title}</h1>
        <p className="max-w-sm text-sm text-ink-soft">{hint}</p>
        <Link href="/" className="btn btn-ghost mt-3 text-sm">
          Zpět na úvod
        </Link>
      </div>
    </Shell>
  );
}

export default async function PrevzitPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error: errorFlag } = await searchParams;

  // Chybové hlášky vrácené z route handleru po neúspěšném form POST.
  const ACCEPT_ERRORS: Record<string, string> = {
    expired: "Platnost pozvánky mezitím vypršela. Požádejte o nový odkaz.",
    taken: "Tuto pozvánku už mezitím někdo uplatnil.",
    nohousehold: "Nemáte založenou domácnost. Obnovte prosím stránku.",
    failed: "Převzetí se nepodařilo dokončit. Zkuste to prosím znovu.",
  };
  const acceptError = errorFlag ? ACCEPT_ERRORS[errorFlag] ?? ACCEPT_ERRORS.failed : null;

  // Token je bearer credential — čteme service-role klientem. Kupující k pozvánce
  // ani nemovitosti nemá RLS přístup, dokud nedojde k převzetí.
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("handover_invitations")
    .select("id, property_id, status, expires_at, accepted_by")
    .eq("token", token)
    .maybeSingle();

  // Je návštěvník přihlášený? (RLS-respecting klient kvůli auth.uid().) Načítáme
  // brzy, ať i chybové/„už převzato" stavy umí poznat, že jde o samotného
  // kupujícího, a nabídnout mu prokliknutí na jeho nemovitost místo slepé uličky.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!invitation) {
    return (
      <InvalidState
        title="Pozvánka nenalezena"
        hint="Tento odkaz k převzetí neexistuje nebo byl zadán chybně. Požádejte prodávajícího o nový odkaz."
      />
    );
  }

  const expired =
    !!invitation.expires_at &&
    new Date(invitation.expires_at).getTime() < Date.now();

  if (invitation.status === "revoked") {
    return (
      <InvalidState
        title="Pozvánka byla zrušena"
        hint="Prodávající tento odkaz k převzetí zneplatnil. Pro nový pokus si vyžádejte aktuální odkaz."
      />
    );
  }
  if (invitation.status === "expired" || (invitation.status === "pending" && expired)) {
    return (
      <InvalidState
        title="Platnost pozvánky vypršela"
        hint="Tento odkaz k převzetí už není platný. Požádejte prodávajícího o vystavení nového."
      />
    );
  }
  if (invitation.status === "accepted") {
    // Pokud pas převzal přihlášený návštěvník sám, neukončuj ho slepou hláškou —
    // nabídni mu přímý proklik na jeho nemovitost.
    if (user && invitation.accepted_by === user.id) {
      return (
        <Shell>
          <div className="card flex flex-col items-center gap-2 p-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-100">
              <BadgeCheck size={22} className="text-teal" />
            </span>
            <h1 className="mt-1 text-xl text-ink">Pas už máte převzatý</h1>
            <p className="max-w-sm text-sm text-ink-soft">
              Tuto nemovitost jste si už převzali do své domácnosti. Najdete ji
              ve svém přehledu i s dokumenty a termíny.
            </p>
            <Link
              href={`/nemovitost/${invitation.property_id}`}
              className="btn btn-primary mt-3 text-sm"
            >
              <Home size={16} />
              Otevřít nemovitost
            </Link>
          </div>
        </Shell>
      );
    }
    return (
      <InvalidState
        title="Pas už byl převzat"
        hint="Tato nemovitost už byla převzata do domácnosti kupujícího. Pokud jste to byli vy, najdete ji ve svém přehledu."
      />
    );
  }

  // status === 'pending' a neexpirováno: načti PŘENOSNOU vrstvu nemovitosti.
  // Vědomě NEnačítáme household, property_owners, osobní doklady ani kontakty.
  // Dokumenty bereme JEN s transferable=true — pouze ty s nemovitostí přecházejí.
  const [{ data: property }, { data: context }, { data: sections }, { data: docsRaw }] =
    await Promise.all([
      admin
        .from("properties")
        .select("id, type, title, street, city, postal_code, country")
        .eq("id", invitation.property_id)
        .maybeSingle(),
      admin
        .from("property_contexts")
        .select(
          "has_chimney, has_gas, has_electrical, has_lps, has_pv, owner_occupied, rental, svj, business_use",
        )
        .eq("property_id", invitation.property_id)
        .maybeSingle(),
      admin
        .from("passport_sections")
        .select("id, kind, title")
        .eq("property_id", invitation.property_id)
        .order("created_at", { ascending: true }),
      // Přenosné dokumenty — pouze ty, které putují s nemovitostí. Joinujeme
      // POTVRZENÉ extrakce (status='confirmed') kvůli klíčovým datům: nikdy
      // nezobrazujeme nepotvrzené AI návrhy (poctivost — žádná smyšlená data).
      admin
        .from("documents")
        .select(
          "id, title, category, file_path, created_at, document_extractions(extracted, status)",
        )
        .eq("property_id", invitation.property_id)
        .eq("transferable", true)
        .order("created_at", { ascending: false }),
    ]);

  if (!property) {
    return (
      <InvalidState
        title="Nemovitost není dostupná"
        hint="Pas k této pozvánce se nepodařilo načíst. Požádejte prodávajícího o nový odkaz."
      />
    );
  }

  const address = [
    property.street,
    [property.postal_code, property.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  // Přítomné technické systémy -> štítky (z přenosného kontextu).
  const systems = [
    context?.has_chimney && "Komín",
    context?.has_gas && "Plyn",
    context?.has_electrical && "Elektroinstalace",
    context?.has_lps && "Hromosvod",
    context?.has_pv && "Fotovoltaika",
  ].filter(Boolean) as string[];

  const sectionRows = sections ?? [];

  // --- Hodnota v první minutě: top dokumenty + klíčová data + stáhnout vše -----
  type ExtractionRow = {
    extracted: {
      warranty_until?: string;
      date?: string;
      inspection_no?: string;
      summary?: string;
    } | null;
    status: "draft" | "confirmed" | "rejected";
  };
  type DocRow = {
    id: string;
    title: string | null;
    category: string;
    file_path: string;
    created_at: string;
    document_extractions: ExtractionRow[] | null;
  };
  const docs = (docsRaw as DocRow[] | null) ?? [];
  const transferableDocs = docs.length;

  // Podepsané URL (TTL 1 h) generujeme server-side adminem — nikdy nevystavujeme
  // syrovou cestu v privátním úložišti. Dvě sady: náhled (otevřít) a stažení
  // (Content-Disposition s názvem souboru). Bez podpisu se odkaz prostě nezobrazí.
  const filePaths = docs.map((d) => d.file_path);
  const previewByPath = new Map<string, string>();
  const downloadByPath = new Map<string, string>();
  if (filePaths.length > 0) {
    // Náhled: jeden batch podpis (otevřít v okně).
    const previewsPromise = admin.storage
      .from("documents")
      .createSignedUrls(filePaths, 3600);
    // Stažení: per-soubor podpis kvůli názvu (Content-Disposition).
    const downloadsPromise = Promise.all(
      docs.map((d) =>
        admin.storage
          .from("documents")
          .createSignedUrl(d.file_path, 3600, {
            download: safeFileName(d.title, d.category, d.id, d.file_path),
          }),
      ),
    );
    const [{ data: previews }, downloads] = await Promise.all([
      previewsPromise,
      downloadsPromise,
    ]);
    for (const row of previews ?? []) {
      if (row?.path && row.signedUrl) previewByPath.set(row.path, row.signedUrl);
    }
    docs.forEach((d, i) => {
      const url = downloads[i]?.data?.signedUrl;
      if (url) downloadByPath.set(d.file_path, url);
    });
  }

  // Klíčová data: jen z POTVRZENÝCH extrakcí přenosných dokumentů. Datum na
  // revizní zprávě je datum PROVEDENÍ revize (ne termín další) — popisujeme to
  // poctivě. Žádné AI návrhy, žádná smyšlená "platnost do".
  type KeyDate = {
    docId: string;
    label: string;
    dateLabel: string;
    sortKey: number;
  };
  const keyDates: KeyDate[] = [];
  for (const d of docs) {
    const confirmed = (d.document_extractions ?? []).find(
      (e) => e.status === "confirmed" && e.extracted,
    );
    if (!confirmed?.extracted) continue;
    const ex = confirmed.extracted;
    const docLabel = d.title?.trim() || DOC_CATEGORY_LABELS[d.category] || "Dokument";
    if (ex.warranty_until) {
      const f = fmtDate(ex.warranty_until);
      if (f)
        keyDates.push({
          docId: d.id,
          label: `Konec záruky — ${docLabel}`,
          dateLabel: f,
          sortKey: Date.parse(ex.warranty_until),
        });
    }
    if (d.category === "penb" && ex.date) {
      const f = fmtDate(ex.date);
      if (f)
        keyDates.push({
          docId: d.id,
          label: `PENB vystaven — ${docLabel}`,
          dateLabel: f,
          sortKey: Date.parse(ex.date),
        });
    }
    if (d.category === "inspection" && ex.date) {
      const f = fmtDate(ex.date);
      if (f)
        keyDates.push({
          docId: d.id,
          label: `Revize provedena — ${docLabel}`,
          dateLabel: f,
          sortKey: Date.parse(ex.date),
        });
    }
  }
  keyDates.sort((a, b) => a.sortKey - b.sortKey);

  // Top dokumenty pro úvodní hodnotu — pár nejdůležitějších, s náhledem i stažením.
  const CATEGORY_PRIORITY: Record<string, number> = {
    penb: 0,
    inspection: 1,
    warranty: 2,
    insurance: 3,
    plan: 4,
    manual: 5,
    contract: 6,
    invoice: 7,
    other: 8,
  };
  const topDocs = [...docs]
    .sort(
      (a, b) =>
        (CATEGORY_PRIORITY[a.category] ?? 9) - (CATEGORY_PRIORITY[b.category] ?? 9),
    )
    .slice(0, 6)
    .map((d) => ({
      id: d.id,
      title: d.title?.trim() || DOC_CATEGORY_LABELS[d.category] || "Dokument",
      categoryLabel: DOC_CATEGORY_LABELS[d.category] ?? "Dokument",
      dateLabel: fmtDate(d.created_at),
      previewUrl: previewByPath.get(d.file_path) ?? null,
      downloadUrl: downloadByPath.get(d.file_path) ?? null,
    }));

  // Pro "Stáhnout vše" sbíráme jen úspěšně podepsané download URL.
  const downloadAllUrls = docs
    .map((d) => downloadByPath.get(d.file_path))
    .filter((u): u is string => Boolean(u));

  // Pro nepřihlášené neseme token přes ?next zpět na tuto stránku. Pod typovanými
  // routami předáváme cíl jako UrlObject (pathname + query), ne jako řetězec.
  const here = `/prevzit/${token}`;
  const registerHref = { pathname: "/registrace", query: { next: here } };
  const loginHref = { pathname: "/prihlaseni", query: { next: here } };

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <span className="badge bg-honey-100 text-honey-600">
            <ArrowRightLeft size={12} /> Předání pasu
          </span>
          <h1 className="mt-3 text-2xl text-ink sm:text-3xl">
            Převezměte pas nemovitosti
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Prodávající vám předává digitální pas této nemovitosti. Po převzetí
            ho budete spravovat ve své domácnosti.
          </p>
        </div>

        {/* Karta nemovitosti — jen přenosná data */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy text-paper">
              <Home size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink">
                {propertyName(property)}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
                <span className="text-muted">
                  {TYPE_LABELS[property.type] ?? "Nemovitost"}
                </span>
                {address && (
                  <>
                    <span className="text-line">·</span>
                    <MapPin size={14} className="text-muted" />
                    <span>{address}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {systems.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Technické systémy
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {systems.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink-soft"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <ShieldCheck size={16} className="shrink-0 text-teal" />
              <span>
                <span className="font-semibold text-ink">{sectionRows.length}</span>{" "}
                {sectionRows.length === 1 ? "sekce pasu" : "sekcí pasu"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <FileText size={16} className="shrink-0 text-honey" />
              <span>
                <span className="font-semibold text-ink">{transferableDocs}</span>{" "}
                {transferableDocs === 1 ? "přenosný dokument" : "přenosných dokumentů"}
              </span>
            </div>
          </div>

          {sectionRows.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Obsah pasu
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {sectionRows.map((s) => (
                  <li key={s.id}>
                    <span className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-soft">
                      {s.title?.trim() || KIND_LABELS[s.kind] || s.kind}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Co se přenáší a co NE — klíčový mentální model + GDPR ujištění */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="card border-teal/30 bg-teal-100/40 p-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-teal" />
              <p className="font-display text-sm font-semibold text-ink">
                Přenáší se na vás
              </p>
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              Pas nemovitosti — konstrukce, technologie, PENB, revize, záruky a
              dokumenty výslovně označené jako přenosné.
            </p>
          </div>
          <div className="card border-line bg-surface-2/60 p-4">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-ink-soft" />
              <p className="font-display text-sm font-semibold text-ink">
                Nepřenáší se
              </p>
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              Osobní doklady, faktury a movitý majetek prodávajícího zůstávají
              jeho domácnosti. Tato data k vám nikdy nepřejdou.
            </p>
          </div>
        </div>

        {/* Hodnota v první minutě: top dokumenty, klíčová data, stáhnout vše */}
        {(topDocs.length > 0 || keyDates.length > 0) && (
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-base font-semibold text-ink">
                  Hodnota hned v první minutě
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  Nejdůležitější dokumenty a termíny, které k nemovitosti patří.
                </p>
              </div>
              {downloadAllUrls.length > 1 && (
                <DownloadAll urls={downloadAllUrls} />
              )}
            </div>

            {keyDates.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  <CalendarClock size={13} /> Klíčová data
                </p>
                <ul className="mt-2 space-y-1.5">
                  {keyDates.map((k) => (
                    <li
                      key={`${k.docId}-${k.label}`}
                      className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-ink-soft">{k.label}</span>
                      <span className="shrink-0 font-medium text-ink">
                        {k.dateLabel}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                  <BadgeCheck size={13} className="mt-0.5 shrink-0 text-teal" />
                  Data pocházejí z potvrzených dokumentů. Datum revize je datum
                  jejího provedení — termín další revize plyne z kontextu nemovitosti.
                </p>
              </div>
            )}

            {topDocs.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  <FileText size={13} /> Klíčové dokumenty
                </p>
                <ul className="mt-2 divide-y divide-line">
                  {topDocs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2">
                        <FileText size={16} className="text-honey" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {d.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {d.categoryLabel}
                          {d.dateLabel ? ` · ${d.dateLabel}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {d.previewUrl && (
                          <a
                            href={d.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline"
                          >
                            <ExternalLink size={13} /> Náhled
                          </a>
                        )}
                        {d.downloadUrl && (
                          <a
                            href={d.downloadUrl}
                            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink"
                          >
                            Stáhnout
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {transferableDocs > topDocs.length && (
                  <p className="mt-2 text-xs text-muted">
                    a další {transferableDocs - topDocs.length}{" "}
                    {transferableDocs - topDocs.length === 1
                      ? "dokument"
                      : transferableDocs - topDocs.length < 5
                        ? "dokumenty"
                        : "dokumentů"}{" "}
                    se přenese po převzetí.
                  </p>
                )}
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
                  <ShieldQuestion size={13} className="mt-0.5 shrink-0 text-ink-soft" />
                  Zobrazené odkazy jsou dočasné (platí 1 hodinu) a vedou jen na
                  dokumenty výslovně označené jako přenosné.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Akce: přihlášený převezme, nepřihlášený se registruje */}
        {user ? (
          <div className="card p-5">
            {acceptError && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{acceptError}</span>
              </div>
            )}
            <p className="font-display text-base font-semibold text-ink">
              Vše připraveno k převzetí
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Pas této nemovitosti přidáme do vaší domácnosti. Soukromá data
              prodávajícího se nepřevádějí.
            </p>
            {/* Form POST na route handler — funguje i bez JavaScriptu.
                Po úspěchu route přesměruje na detail převzaté nemovitosti. */}
            <form action="/api/handover/accept" method="post" className="mt-4">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn btn-primary w-full text-sm">
                <ArrowRightLeft size={16} />
                Převzít do mé domácnosti
              </button>
            </form>
          </div>
        ) : (
          <div className="card p-5">
            <p className="font-display text-base font-semibold text-ink">
              Pro převzetí se přihlaste
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Pas převezmeme do vaší domácnosti. Stačí si založit účet zdarma —
              po registraci vás vrátíme přesně sem.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link href={registerHref} className="btn btn-primary text-sm sm:flex-1">
                Založit účet a převzít
              </Link>
              <Link href={loginHref} className="btn btn-ghost text-sm sm:flex-1">
                Už mám účet — přihlásit se
              </Link>
            </div>
          </div>
        )}

        {invitation.expires_at && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <Clock size={13} />
            Odkaz je platný do{" "}
            {new Date(invitation.expires_at).toLocaleDateString("cs-CZ", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
        )}
      </div>
    </Shell>
  );
}
