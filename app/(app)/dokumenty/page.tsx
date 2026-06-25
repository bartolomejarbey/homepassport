// Dokumenty — zdroj pravdy. Seznam dokumentů (kategorie, přenositelnost, stav
// AI návrhu) + UploadCard pro nahrání nového dokumentu do soukromého úložiště.
import Link from "next/link";
import { FileText, ChevronRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
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

type ExtractionRow = { status: "draft" | "confirmed" | "rejected"; confidence: number | null };
type DocRow = {
  id: string;
  title: string | null;
  category: string;
  transferable: boolean;
  created_at: string;
  document_extractions: ExtractionRow[] | null;
};

function extractionBadge(extractions: ExtractionRow[] | null) {
  const list = extractions ?? [];
  if (list.some((e) => e.status === "confirmed"))
    return <Badge tone="verified">Potvrzeno</Badge>;
  if (list.some((e) => e.status === "draft"))
    return (
      <Badge tone="insurance_recommended">
        <Sparkles size={11} /> Návrh
      </Badge>
    );
  return null;
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

  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user!.id)
    .limit(1)
    .maybeSingle();

  const householdId = membership?.household_id ?? null;

  let docs: DocRow[] = [];
  if (householdId) {
    const { data } = await sb
      .from("documents")
      .select(
        "id, title, category, transferable, created_at, document_extractions(status, confidence)",
      )
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });
    docs = (data as DocRow[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">Dokumenty</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          Vaše dokumenty
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <section className="order-2 space-y-3 lg:order-1">
            {docs.length === 0 ? (
              <EmptyState
                title="Zatím žádné dokumenty"
                hint="Nahrajte první soubor vpravo — třeba revizní zprávu nebo fakturu za spotřebič."
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
            <UploadCard householdId={householdId} propertyId={propertyId ?? null} />
          </aside>
        </div>
      )}
    </div>
  );
}
