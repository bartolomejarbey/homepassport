// Přehled — dashboard: greeting + summary cards (dokumenty, připomínky, majetek, stav pasu).
import Link from "next/link";
import { FileText, BellRing, Package, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Přehled — Home Passport" };

type StatTone = "verified" | "legal_required" | "recommended";

function firstName(full: string | null, email: string | null | undefined) {
  const n = (full ?? "").trim();
  if (n) return n.split(/\s+/)[0];
  if (email) return email.split("@")[0];
  return "vítejte";
}

export default async function PrehledPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  // profile for the greeting (RLS: profiles_self)
  const { data: profile } = await sb
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .maybeSingle();

  // user's household (first membership). No household yet => graceful zeros.
  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user!.id)
    .limit(1)
    .maybeSingle();

  const householdId = membership?.household_id ?? null;

  let docCount = 0;
  let openReminders = 0;
  let assetCount = 0;
  let passportSections = 0;

  if (householdId) {
    const [docs, reminders, assets, sections] = await Promise.all([
      sb
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId),
      sb
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("status", "open"),
      sb
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId),
      // passport sections are property-scoped; reach them via this household's property
      sb
        .from("property_owners")
        .select("properties(passport_sections(id))")
        .eq("household_id", householdId),
    ]);

    docCount = docs.count ?? 0;
    openReminders = reminders.count ?? 0;
    assetCount = assets.count ?? 0;
    passportSections =
      (sections.data ?? []).reduce((acc: number, row: any) => {
        const props = Array.isArray(row.properties)
          ? row.properties
          : row.properties
            ? [row.properties]
            : [];
        return (
          acc +
          props.reduce(
            (s: number, p: any) => s + (p?.passport_sections?.length ?? 0),
            0,
          )
        );
      }, 0) ?? 0;
  }

  // honest passport-status wording
  const passport: { label: string; tone: StatTone; hint: string } = !householdId
    ? {
        label: "Nezaložen",
        tone: "recommended",
        hint: "Založte domácnost a nemovitost",
      }
    : passportSections === 0
      ? {
          label: "Rozpracovaný",
          tone: "recommended",
          hint: "Zatím žádné sekce pasu",
        }
      : passportSections < 4
        ? {
            label: "Rozpracovaný",
            tone: "insurance_recommended" as StatTone,
            hint: `${passportSections} z doporučených sekcí`,
          }
        : {
            label: "Připraven",
            tone: "verified",
            hint: `${passportSections} vyplněných sekcí`,
          };

  const cards = [
    {
      label: "Dokumenty",
      value: docCount,
      icon: FileText,
      href: "/dokumenty",
      sub: docCount === 0 ? "Nahrajte první dokument" : "uložených souborů",
    },
    {
      label: "Otevřené připomínky",
      value: openReminders,
      icon: BellRing,
      href: "/pripominky",
      sub: openReminders === 0 ? "Nic vás nečeká" : "k vyřízení",
    },
    {
      label: "Položky majetku",
      value: assetCount,
      icon: Package,
      href: "/majetek",
      sub: assetCount === 0 ? "Přidejte spotřebiče" : "evidovaných položek",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">Přehled</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          Vítejte zpět, {firstName(profile?.full_name ?? null, user?.email)}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Stav vaší nemovitosti a domácnosti na jednom místě.
        </p>
      </header>

      {!householdId && (
        <Card className="border-honey/40 bg-honey-100/40">
          <p className="font-display text-base text-ink">
            Zatím nemáte založenou domácnost
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Vytvořte domácnost a přidejte nemovitost — pak začne mít přehled co
            zobrazovat.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, href, sub }) => (
          <Link key={label} href={href} className="block">
            <Card className="h-full transition-colors hover:border-navy/30">
              <div className="flex items-start justify-between">
                <span className="text-sm font-medium text-ink-soft">
                  {label}
                </span>
                <Icon size={18} className="text-honey" />
              </div>
              <p className="mt-3 font-display text-3xl font-semibold text-ink">
                {value}
              </p>
              <p className="mt-1 text-xs text-muted">{sub}</p>
            </Card>
          </Link>
        ))}

        <Link href="/nemovitost" className="block">
          <Card className="h-full transition-colors hover:border-navy/30">
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium text-ink-soft">
                Stav pasu
              </span>
              <BadgeCheck size={18} className="text-honey" />
            </div>
            <div className="mt-3">
              <Badge tone={passport.tone}>{passport.label}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted">{passport.hint}</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
