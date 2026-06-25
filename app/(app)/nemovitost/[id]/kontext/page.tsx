// Context questionnaire — feeds property_contexts, which drives the revize engine.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { PropertyContext } from "@/lib/db/types";
import { propertyName } from "../../_components/PropertyMeta";
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

  // RLS gates access; missing property => 404.
  const { data: property } = await sb
    .from("properties")
    .select("id, type, title, street, city")
    .eq("id", id)
    .maybeSingle();

  if (!property) notFound();

  const { data: context } = await sb
    .from("property_contexts")
    .select(
      "property_id, owner_occupied, rental, svj, business_use, has_chimney, chimney_fuel, has_gas, has_electrical, has_lps, has_pv",
    )
    .eq("property_id", id)
    .maybeSingle();

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
        initial={(context as PropertyContext | null) ?? null}
      />
    </div>
  );
}
