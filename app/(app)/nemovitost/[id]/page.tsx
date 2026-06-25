// Property detail — passport sections (grouped) + transferable "pas" vs private data.
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  SlidersHorizontal,
  ArrowRightLeft,
  Lock,
  CheckCircle2,
  CircleDashed,
  ChevronRight,
  FileText,
  BellRing,
  Package,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import {
  StatusBadge,
  TYPE_LABELS,
  propertyName,
  formatAddress,
  type PropertyType,
} from "../_components/PropertyMeta";
import {
  PassportSections,
  type PassportSectionRow,
} from "../_components/PassportSections";
import { EditPropertyForm } from "../_components/EditPropertyForm";

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const sb = await createClient();
  const { data } = await sb
    .from("properties")
    .select("title, type, street, city")
    .eq("id", id)
    .maybeSingle();
  const name = data ? propertyName(data) : "Nemovitost";
  return { title: `${name} — Home Passport` };
}

export default async function NemovitostDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const sb = await createClient();

  // RLS (prop_access) guarantees we only see properties we may access.
  const { data: property } = await sb
    .from("properties")
    .select("id, type, title, street, city, postal_code, status, cadastral_id")
    .eq("id", id)
    .maybeSingle();

  if (!property) notFound();

  const [
    { data: context },
    { data: sectionsRaw },
    { count: transferableDocs },
    { count: privateDocs },
    { count: openReminders },
    { count: propertyAssets },
  ] = await Promise.all([
    sb
      .from("property_contexts")
      .select("property_id, owner_occupied, rental, svj, business_use, has_chimney")
      .eq("property_id", id)
      .maybeSingle(),
    sb
      .from("passport_sections")
      .select("id, kind, title, data")
      .eq("property_id", id)
      .order("created_at", { ascending: true }),
    // Documents that travel with the property (part of the transferable pas).
    sb
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .eq("transferable", true),
    // Documents attached to the property but NOT transferable (stay private).
    sb
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .eq("transferable", false),
    // Open contextual reminders for this property (revize hub). "Otevřené" =
    // open i snoozed — stejně jako je seskupuje /pripominky a počítá /prehled,
    // aby číslo sedělo s tím, co uživatel po prokliku uvidí.
    sb
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id)
      .in("status", ["open", "snoozed"]),
    // Movitý majetek (Home OS) navázaný na tuto nemovitost — soukromá vrstva.
    // RLS (assets_access) omezí počet na položky domácnosti uživatele.
    sb
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("property_id", id),
  ]);

  const sections = (sectionsRaw ?? []) as PassportSectionRow[];
  const address = formatAddress(property);
  const contextDone =
    !!context &&
    (context.owner_occupied ||
      context.rental ||
      context.svj ||
      context.business_use);

  return (
    <div className="space-y-6">
      <Link
        href="/nemovitost"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft size={16} />
        Zpět na nemovitosti
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
              {propertyName(property)}
            </h1>
            <StatusBadge status={property.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
            <span className="text-muted">
              {TYPE_LABELS[(property.type as PropertyType)] ?? "Nemovitost"}
            </span>
            {address && (
              <>
                <span className="text-line">·</span>
                <MapPin size={14} className="text-muted" />
                <span>{address}</span>
              </>
            )}
            {property.cadastral_id && (
              <>
                <span className="text-line">·</span>
                <span className="font-mono text-xs text-muted">
                  LV {property.cadastral_id}
                </span>
              </>
            )}
          </p>
        </div>
        <Link href={`/nemovitost/${id}/kontext`}>
          <Button variant="ghost">
            <SlidersHorizontal size={16} />
            Upravit kontext
          </Button>
        </Link>
      </header>

      {/* Edit the passport's own identity fields (collapsed behind a button). */}
      <EditPropertyForm
        property={{
          id: property.id,
          type: property.type,
          title: property.title,
          street: property.street,
          city: property.city,
          postal_code: property.postal_code,
          cadastral_id: property.cadastral_id,
          status: property.status,
        }}
      />

      {/* Context nudge */}
      {!contextDone && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-honey/40 bg-honey-100/40 p-5">
          <div className="flex items-start gap-2.5">
            <CircleDashed size={18} className="mt-0.5 shrink-0 text-honey-600" />
            <div>
              <p className="font-display text-base text-ink">
                Doplňte kontext nemovitosti
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">
                Podle využití a systémů připravíme jen ty připomínky revizí,
                které se vás opravdu týkají.
              </p>
            </div>
          </div>
          <Link href={`/nemovitost/${id}/kontext`}>
            <Button variant="honey">Vyplnit kontext</Button>
          </Link>
        </div>
      )}

      {/* Transferable "pas" vs private data — the core mental model */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card flex flex-col p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-teal-100">
              <ArrowRightLeft size={18} className="text-teal" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">
                Pas nemovitosti
              </h2>
              <p className="text-xs text-muted">Přenosné na nového majitele</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Konstrukce, technologie, PENB, revize, záruky a pevné vybavení.
            Tato část tvoří přenositelný pas — při prodeji přechází i s
            připojenými dokumenty na kupujícího.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-teal">
            <CheckCircle2 size={14} />
            Putuje s nemovitostí
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <Link
              href={`/dokumenty?property=${id}`}
              className="group rounded-md border border-line bg-surface px-3 py-2.5 transition-colors hover:border-teal/40"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <FileText size={13} />
                Přenosné dokumenty
              </span>
              <span className="mt-0.5 flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-ink">
                  {transferableDocs ?? 0}
                </span>
                <ChevronRight
                  size={15}
                  className="text-muted transition-colors group-hover:text-teal"
                />
              </span>
            </Link>
            <Link
              href="/pripominky"
              className="group rounded-md border border-line bg-surface px-3 py-2.5 transition-colors hover:border-teal/40"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <BellRing size={13} />
                Otevřené revize
              </span>
              <span className="mt-0.5 flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-ink">
                  {openReminders ?? 0}
                </span>
                <ChevronRight
                  size={15}
                  className="text-muted transition-colors group-hover:text-teal"
                />
              </span>
            </Link>
          </div>
        </div>

        <div className="card flex flex-col p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2">
              <Lock size={18} className="text-ink-soft" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">
                Soukromá data
              </h2>
              <p className="text-xs text-muted">Zůstávají vám</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Osobní doklady, faktury domácnosti, váš movitý majetek a smlouvy
            vázané na vás. Tato část je soukromá a při prodeji se
            nepřevádí — zůstává ve vaší domácnosti.
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Lock size={14} />
            Nepřevádí se
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <Link
              href={`/dokumenty?property=${id}`}
              className="group rounded-md border border-line bg-surface px-3 py-2.5 transition-colors hover:border-ink-soft/30"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <FileText size={13} />
                Soukromé dokumenty
              </span>
              <span className="mt-0.5 flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-ink">
                  {privateDocs ?? 0}
                </span>
                <ChevronRight
                  size={15}
                  className="text-muted transition-colors group-hover:text-ink"
                />
              </span>
            </Link>
            <Link
              href="/majetek"
              className="group rounded-md border border-line bg-surface px-3 py-2.5 transition-colors hover:border-ink-soft/30"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Package size={13} />
                Movitý majetek
              </span>
              <span className="mt-0.5 flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-ink">
                  {propertyAssets ?? 0}
                </span>
                <ChevronRight
                  size={15}
                  className="text-muted transition-colors group-hover:text-ink"
                />
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Passport sections grouped */}
      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Sekce pasu
        </h2>
        <p className="mb-4 mt-0.5 text-sm text-ink-soft">
          Obsah pasu rozdělený do oblastí. Doplňujte ho nahráváním dokumentů.
        </p>
        <PassportSections sections={sections} />
      </section>
    </div>
  );
}
