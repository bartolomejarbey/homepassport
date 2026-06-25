// Dokumenty — zdroj pravdy. Seznam dokumentů (kategorie, přenositelnost, stav
// AI návrhu) + UploadCard pro nahrání nového dokumentu do soukromého úložiště.
import Link from "next/link";
import { FileText, ChevronRight, Sparkles, Building2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { propertyName } from "../nemovitost/_components/PropertyMeta";
import { UploadCard } from "./_components/UploadCard";

export const metadata = { title: "Dokumenty — Home Passport" };

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

type ExtractionRow = {
  status: "draft" | "confirmed" | "rejected";
  created_at: string;
};
type DocRow = {
  id: string;
  title: string | null;
  category: string;
  transferable: boolean;
  created_at: string;
  document_extractions: ExtractionRow[] | null;
};

// Stav v seznamu musí odpovídat detailu: bereme NEJNOVĚJŠÍ extrakci, ne „jakákoli
// potvrzená vyhrává". Vnořený select nezaručuje pořadí, proto řadíme zde.
function extractionBadge(extractions: ExtractionRow[] | null) {
  const list = [...(extractions ?? [])].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const latest = list[0];
  if (!latest) return null;
  if (latest.status === "confirmed")
    return <Badge tone="verified">Potvrzeno</Badge>;
  if (latest.status === "draft")
    return (
      <Badge tone="insurance_recommended">
        <Sparkles size={11} /> Návrh
      </Badge>
    );
  return null; // odmítnuto -> bez odznaku (uživatel může navrhnout znovu v detailu)
}

export default async function DokumentyPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { property: propertyId } = await searchParams;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  // Členství v domácnosti (dle uživatele) a ověření nemovitosti z ?property=… (dle
  // jejího id) na sobě nezávisí — pustíme je naráz místo za sebou. Filtr na docs níže
  // pak potřebuje obojí, takže oba dotazy nejdřív počkáme.
  // U nemovitosti ověřujeme přístup přes RLS (vrátí null, pokud na ni uživatel nemá
  // právo) a seznam dokumentů pak zúžíme jen na ni.
  const [membershipRes, propertyRes] = await Promise.all([
    sb
      .from("household_members")
      .select("household_id")
      .eq("user_id", user!.id)
      .limit(1)
      .maybeSingle(),
    propertyId
      ? sb
          .from("properties")
          .select("id, title, type, street, city")
          .eq("id", propertyId)
          .maybeSingle()
      : Promise.resolve({
          data: null as {
            id: string;
            title: string | null;
            type: string;
            street: string | null;
            city: string | null;
          } | null,
        }),
  ]);

  const householdId = membershipRes.data?.household_id ?? null;
  const property = propertyRes.data ?? null;
  const activePropertyId = property?.id ?? null;

  let docs: DocRow[] = [];
  if (householdId) {
    let query = sb
      .from("documents")
      .select(
        "id, title, category, transferable, created_at, document_extractions(status, created_at)",
      )
      .eq("household_id", householdId);
    // Filtr na nemovitost platí jen tehdy, když k ní opravdu máme přístup.
    if (activePropertyId) query = query.eq("property_id", activePropertyId);
    const { data } = await query.order("created_at", { ascending: false });
    docs = (data as DocRow[] | null) ?? [];
  }

  const propertyLabel = property ? propertyName(property) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">Dokumenty</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          {propertyLabel ? "Dokumenty nemovitosti" : "Vaše dokumenty"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Faktury, smlouvy, revizní zprávy i záruky na jednom soukromém místě. Z každého
          dokumentu navrhneme data — vy je potvrdíte.
        </p>
      </header>

      {!householdId ? (
        <Card className="border-honey/40 bg-honey-100/40">
          <p className="font-display text-base text-ink">
            Zatím nemáte založenou domácnost
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Domácnost vzniká automaticky po registraci. Pokud ji nevidíte, zkuste se
            odhlásit a znovu přihlásit.
          </p>
        </Card>
      ) : (
        <>
          {propertyLabel && (
            <Card className="flex flex-wrap items-center justify-between gap-3 border-teal/30 bg-teal-100/40 py-3">
              <span className="flex items-center gap-2 text-sm text-ink">
                <Building2 size={16} className="text-teal" />
                Zobrazují se dokumenty navázané na nemovitost{" "}
                <Link
                  href={`/nemovitost/${activePropertyId}`}
                  className="font-medium text-navy hover:underline"
                >
                  {propertyLabel}
                </Link>
                .
              </span>
              <Link
                href="/dokumenty"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              >
                <X size={14} /> Zobrazit všechny
              </Link>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <section className="order-2 space-y-3 lg:order-1">
              {docs.length === 0 ? (
                <EmptyState
                  title={propertyLabel ? "K této nemovitosti zatím žádné dokumenty" : "Zatím žádné dokumenty"}
                  hint={
                    propertyLabel
                      ? "Nahrajte první soubor vpravo — uloží se rovnou k této nemovitosti."
                      : "Nahrajte první soubor vpravo — třeba revizní zprávu nebo fakturu za spotřebič."
                  }
                />
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
                          <div className="flex shrink-0 items-center gap-2">
                            {d.transferable && (
                              <Badge tone="recommended">K nemovitosti</Badge>
                            )}
                            {extractionBadge(d.document_extractions)}
                            <Badge tone="draft">
                              {CATEGORY_LABEL[d.category] ?? d.category}
                            </Badge>
                            <ChevronRight size={16} className="text-muted" />
                          </div>
                        </Card>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <aside className="order-1 lg:order-2">
              <UploadCard householdId={householdId} propertyId={activePropertyId} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
