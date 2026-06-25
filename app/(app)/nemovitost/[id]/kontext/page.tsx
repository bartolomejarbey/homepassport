// Context questionnaire — feeds property_contexts, which drives the revize engine.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { PropertyContext } from "@/lib/db/types";
import { propertyName, type PropertyType } from "../../_components/PropertyMeta";
import { PropertyContextForm } from "../../_components/PropertyContextForm";

type Params = { id: string };

export const metadata = { title: "Kontext nemovitosti — Home Passport" };

export default async function KontextPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const sb = await createClient();

  // Nemovitost a její kontext jsou nezávislé dotazy (oba jen dle id) — pustíme je
  // naráz místo za sebou. Když nemovitost neexistuje / není přístupná, stejně končíme
  // 404 a kontext zahodíme; ušetřený round-trip ale zrychlí běžnou cestu.
  // RLS gates access; missing property => 404.
  const [propertyRes, contextRes] = await Promise.all([
    sb
      .from("properties")
      .select("id, type, title, street, city")
      .eq("id", id)
      .maybeSingle(),
    sb
      .from("property_contexts")
      .select(
        "property_id, owner_occupied, rental, svj, business_use, has_chimney, chimney_fuel, has_gas, has_electrical, has_lps, has_pv",
      )
      .eq("property_id", id)
      .maybeSingle(),
  ]);

  const property = propertyRes.data;
  if (!property) notFound();

  // The honesty preview must mirror exactly which revision_rules exist for THIS
  // property type (seed has gas/electrical/lps only for 'house'; chimney also for
  // 'apartment'). Without the type, the preview would promise reminders the engine
  // never creates (e.g. gas revize for a byt). See PropertyContextForm's per-type
  // rule matrix (matrixForType).
  const propertyType = (property.type as PropertyType) ?? "house";

  const context = contextRes.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/nemovitost/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft size={16} />
        Zpět na nemovitost
      </Link>

      <header>
        <p className="text-sm text-muted">{propertyName(property)}</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          Kontext nemovitosti
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Pár otázek o využití a vybavení nemovitosti. Z odpovědí připravíme
          připomínky revizí — poctivě a jen ty, které se vás opravdu týkají.
        </p>
      </header>

      <PropertyContextForm
        propertyId={id}
        propertyType={propertyType}
        initial={(context as PropertyContext | null) ?? null}
      />
    </div>
  );
}
