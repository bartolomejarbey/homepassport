// /pro — B2B dashboard. No org yet → found one. Has an org → show its passports,
// quick stats, and the primary actions: create a passport, upload documents
// (AI sorts), hand over to a buyer.
import Link from "next/link";
import { ArrowRight, FolderKanban, FileStack, Send, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateOrgForm } from "../../_components/CreateOrgForm";
import { CreatePropertyDialog } from "../../_components/CreatePropertyDialog";
import { PropertyList } from "../../_components/PropertyList";
import { getMyOrgs, getOrgProperties, getOrgHandoverStats } from "../../_components/data";

export const metadata = { title: "Pro firmy — Home Passport" };

export default async function ProDashboardPage() {
  const orgs = await getMyOrgs();

  if (orgs.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm text-muted">Pro firmy</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
            Konzole pro developery a stavební firmy
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Založte pas každé jednotky, nahrajte k němu dokumenty a předejte ho
            kupujícímu jediným odkazem. Žádné šanony, žádné předávací protokoly
            na papíře.
          </p>
        </header>
        <CreateOrgForm />
      </div>
    );
  }

  // MVP: work with the first org. (Org switcher can come later.)
  const org = orgs[0];
  const properties = await getOrgProperties(org.id);
  const handover = await getOrgHandoverStats(properties.map((p) => p.id));

  // "Handed over" = accepted invitation, not property.status (which becomes
  // 'active' on the buyer side after accept — see getOrgHandoverStats).
  const transferredCount = handover.handedOver.size;
  const draftCount = properties.filter(
    (p) => p.status === "draft" && !handover.handedOver.has(p.id),
  ).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Pro firmy</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">{org.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Pasy nemovitostí vaší firmy. Vytvořte nový a nechte AI roztřídit dokumenty.
          </p>
        </div>
        <CreatePropertyDialog orgId={org.id} />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-honey-100">
            <FolderKanban size={18} className="text-honey-600" />
          </span>
          <p className="mt-3 text-2xl font-semibold text-ink">{properties.length}</p>
          <p className="text-sm text-muted">Pasů nemovitostí</p>
        </div>
        <div className="card p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2">
            <FileStack size={18} className="text-ink-soft" />
          </span>
          <p className="mt-3 text-2xl font-semibold text-ink">{draftCount}</p>
          <p className="text-sm text-muted">Rozpracovaných</p>
        </div>
        <div className="card p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-100">
            <Send size={18} className="text-teal" />
          </span>
          <p className="mt-3 text-2xl font-semibold text-ink">{transferredCount}</p>
          <p className="text-sm text-muted">Předaných kupujícím</p>
        </div>
      </div>

      <section className="card border-honey/40 bg-honey-100/40 p-5">
        <p className="flex items-center gap-2 font-display text-base font-semibold text-ink">
          <Sparkles size={17} className="text-honey-600" /> Nahrajte dokumenty, AI je roztřídí
        </p>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Nemusíte vyplňovat formuláře. Založte pas, nahrajte PENB, revizní zprávy,
          návody a faktury — AI z nich navrhne strukturovaný pas a vy ho jen
          potvrdíte. Každý návrh má odkaz na zdrojový dokument.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Poslední pasy</h2>
          {properties.length > 0 && (
            <Link
              href="/pro/nemovitosti"
              className="flex items-center gap-1 text-sm font-medium text-navy hover:text-navy-700"
            >
              Všechny nemovitosti
              <ArrowRight size={15} />
            </Link>
          )}
        </div>

        {properties.length === 0 ? (
          <EmptyState
            title="Zatím žádný pas"
            hint="Vytvořte první pas nemovitosti. Pak k němu jen nahrajete dokumenty a AI je roztřídí."
          />
        ) : (
          <PropertyList
            properties={properties.slice(0, 5)}
            handedOver={handover.handedOver}
            pending={handover.pending}
          />
        )}
      </section>
    </div>
  );
}
