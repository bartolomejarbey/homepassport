// /pro/nemovitosti/[id] — detail firemního pasu nemovitosti. Sem míří primární CTA
// konzole („Nahrát dokumenty"). Dříve odkazovaly na spotřebitelské /dokumenty, kam
// firma (bez domácnosti) nemá přístup — odkaz vedl do slepé uličky. Tady firma
// nahrává dokumenty na vrstvu nemovitosti, vidí AI návrhy a předá pas kupujícímu.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, MapPin, Sparkles, Building2, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { HandoverDialog } from "../../../../_components/HandoverDialog";
import { ProUploadCard } from "../../../../_components/ProUploadCard";
import {
  getOrgProperty,
  getPassportDocuments,
  getPropertyHandoverState,
} from "../../../../_components/data";
import {
  TYPE_LABELS,
  STATUS_LABELS,
  propertyName,
  formatAddress,
} from "../../../../_components/propertyMeta";

export const metadata = { title: "Pas nemovitosti — Pro firmy" };

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

const STATUS_PILL: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  active: "bg-teal-100 text-teal",
  transferred: "bg-honey-100 text-honey-600",
  archived: "bg-surface-2 text-muted",
};

export default async function ProPropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // RLS vrátí null, pokud na pas firma nemá právo → 404 místo prázdné stránky.
  const property = await getOrgProperty(id);
  if (!property) notFound();

  const [docs, { handedOver, hasPendingInvite: hasPending }] = await Promise.all([
    getPassportDocuments(id),
    getPropertyHandoverState(id),
  ]);

  const label = propertyName(property);
  const address = formatAddress(property);

  return (
    <div className="space-y-6">
      <Link
        href="/pro/nemovitosti"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-navy"
      >
        <ArrowLeft size={15} />
        Zpět na pasy nemovitostí
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{label}</h1>
            {handedOver ? (
              <span className="badge bg-honey-100 text-honey-600">
                <CheckCircle2 size={12} /> Předáno kupujícímu
              </span>
            ) : (
              <span className={`badge ${STATUS_PILL[property.status] ?? "bg-surface-2 text-muted"}`}>
                {STATUS_LABELS[property.status] ?? property.status}
              </span>
            )}
            {hasPending && (
              <span className="badge bg-teal-100 text-teal">
                <Clock size={12} /> Odkaz čeká na kupujícího
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
            <span className="text-muted">{TYPE_LABELS[property.type] ?? "Nemovitost"}</span>
            {address && (
              <>
                <span className="text-line">·</span>
                <MapPin size={14} className="text-muted" />
                <span className="truncate">{address}</span>
              </>
            )}
          </p>
        </div>

        {!handedOver && (
          <HandoverDialog propertyId={id} propertyLabel={label} hasPendingInvite={hasPending} />
        )}
      </header>

      <Card className="flex items-start gap-2.5 border-honey/40 bg-honey-100/40 py-4">
        <Sparkles size={17} className="mt-0.5 shrink-0 text-honey-600" />
        <p className="text-sm text-ink-soft">
          Nahrajte technickou dokumentaci — PENB, revizní zprávy, projekt, návody. AI
          z každého dokumentu navrhne strukturovaná data s odkazem na zdroj. Vy je jen
          potvrdíte a pas předáte kupujícímu jediným odkazem.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="order-2 space-y-3 lg:order-1">
          <h2 className="font-display text-lg font-semibold text-ink">
            Dokumenty pasu
            {docs.length > 0 && <span className="ml-2 text-sm font-normal text-muted">({docs.length})</span>}
          </h2>

          {docs.length === 0 ? (
            <EmptyState
              title="Zatím žádné dokumenty"
              hint="Nahrajte vpravo první soubor — třeba PENB nebo revizní zprávu. AI z něj navrhne data."
            />
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id}>
                  <Card className="flex items-center gap-4 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2">
                      <FileText size={18} className="text-honey" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{d.title ?? "Bez názvu"}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {new Date(d.created_at).toLocaleDateString("cs-CZ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {d.transferable && <Badge tone="recommended">K nemovitosti</Badge>}
                      {d.extraction?.status === "confirmed" ? (
                        <Badge tone="verified">Potvrzeno</Badge>
                      ) : d.extraction?.status === "draft" ? (
                        <Badge tone="insurance_recommended">
                          <Sparkles size={11} /> Návrh
                        </Badge>
                      ) : null}
                      <Badge tone="draft">{CATEGORY_LABEL[d.category] ?? d.category}</Badge>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-center gap-1.5 pt-1 text-xs text-muted">
            <Building2 size={13} />
            Dokumenty patří k nemovitosti (ne k vaší domácnosti) a přejdou na kupujícího při předání pasu.
          </p>
        </section>

        <aside className="order-1 lg:order-2">
          <ProUploadCard propertyId={id} />
        </aside>
      </div>
    </div>
  );
}
