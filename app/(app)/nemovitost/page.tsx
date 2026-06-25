// Nemovitost — list the household's properties with status; CTA to found a new one.
import Link from "next/link";
import { Home, MapPin, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreatePropertyButton } from "./_components/CreatePropertyButton";
import {
  StatusBadge,
  TYPE_LABELS,
  propertyName,
  formatAddress,
  type PropertyType,
} from "./_components/PropertyMeta";

export const metadata = { title: "Nemovitosti — Home Passport" };

export default async function NemovitostiPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  // The household(s) this user belongs to.
  const { data: memberships } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user!.id);

  const householdIds = (memberships ?? []).map((m) => m.household_id);

  type PropertyRow = {
    id: string;
    type: string;
    title: string | null;
    street: string | null;
    city: string | null;
    postal_code: string | null;
    status: string;
  };

  let properties: PropertyRow[] = [];
  if (householdIds.length) {
    const { data } = await sb
      .from("property_owners")
      .select(
        "properties(id, type, title, street, city, postal_code, status)",
      )
      .in("household_id", householdIds);

    // Flatten + de-duplicate (a property may be co-owned across households).
    const seen = new Set<string>();
    properties = (data ?? [])
      .flatMap((row: { properties: PropertyRow | PropertyRow[] | null }) =>
        Array.isArray(row.properties)
          ? row.properties
          : row.properties
            ? [row.properties]
            : [],
      )
      .filter((p) => {
        if (!p || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Nemovitosti</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
            Vaše nemovitosti
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Digitální pas každé nemovitosti — přenosný na nového majitele při
            prodeji.
          </p>
        </div>
        <CreatePropertyButton />
      </header>

      {properties.length === 0 ? (
        <EmptyState
          title="Zatím žádná nemovitost"
          hint="Založte první nemovitost a začněte plnit její pas — dokumenty, revize, záruky i vybavení."
        />
      ) : (
        <ul className="space-y-3">
          {properties.map((p) => {
            const address = formatAddress(p);
            return (
              <li key={p.id}>
                <Link href={`/nemovitost/${p.id}`} className="block">
                  <div className="card flex items-center gap-4 p-5 transition-colors hover:border-navy/30">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-navy">
                      <Home size={20} className="text-honey" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-display text-lg font-semibold text-ink">
                          {propertyName(p)}
                        </p>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                        <span className="text-muted">
                          {TYPE_LABELS[(p.type as PropertyType)] ?? "Nemovitost"}
                        </span>
                        {address && (
                          <>
                            <span className="text-line">·</span>
                            <MapPin size={14} className="text-muted" />
                            <span className="truncate">{address}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
