// /pro/nemovitosti — full list of the firm's property passports. Without an org,
// bounce to /pro to found one first.
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreatePropertyDialog } from "../../../_components/CreatePropertyDialog";
import { PropertyList } from "../../../_components/PropertyList";
import { getMyOrgs, getOrgProperties } from "../../../_components/data";

export const metadata = { title: "Nemovitosti — Pro firmy" };

export default async function ProPropertiesPage() {
  const orgs = await getMyOrgs();
  if (orgs.length === 0) redirect("/pro");

  const org = orgs[0];
  const properties = await getOrgProperties(org.id);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{org.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
            Pasy nemovitostí
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            U každého pasu nahrajte dokumenty (AI je roztřídí) a předejte ho
            kupujícímu jediným odkazem.
          </p>
        </div>
        <CreatePropertyDialog orgId={org.id} />
      </header>

      {properties.length === 0 ? (
        <EmptyState
          title="Zatím žádný pas"
          hint="Vytvořte první pas nemovitosti — stačí typ. Detaily doplní AI z nahraných dokumentů."
        />
      ) : (
        <PropertyList properties={properties} />
      )}
    </div>
  );
}
