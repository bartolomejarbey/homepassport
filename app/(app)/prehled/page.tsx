// Přehled — dashboard: pozdrav + souhrnné dlaždice (dokumenty, připomínky,
// majetek, stav pasu), poctivý onboarding a rychlé akce na reálné trasy.
import Link from "next/link";
import {
  FileText,
  BellRing,
  Package,
  BadgeCheck,
  Home,
  Upload,
  Camera,
  Search,
  ArrowRight,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Přehled — Home Passport" };

// Tóny štítku stavu pasu — podmnožina tónů komponenty Badge.
type StatTone = "verified" | "insurance_recommended" | "recommended";

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

  // Profil pro pozdrav (RLS: profiles_self).
  const { data: profile } = await sb
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .maybeSingle();

  // Domácnost uživatele vzniká automaticky při registraci (trigger handle_new_user),
  // takže přihlášený uživatel ji vždy má. Skutečný první krok onboardingu je
  // založení nemovitosti — podle toho řídíme prázdné stavy.
  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user!.id)
    .limit(1)
    .maybeSingle();

  const householdId = membership?.household_id ?? null;

  let propertyId: string | null = null;
  let docCount = 0;
  let openReminders = 0;
  let assetCount = 0;
  let passportSections = 0;

  if (householdId) {
    // První nemovitost domácnosti — cíl pro pas i rychlé akce.
    const { data: ownerLink } = await sb
      .from("property_owners")
      .select("property_id")
      .eq("household_id", householdId)
      .limit(1)
      .maybeSingle();
    propertyId = ownerLink?.property_id ?? null;

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
      propertyId
        ? sb
            .from("passport_sections")
            .select("id", { count: "exact", head: true })
            .eq("property_id", propertyId)
        : Promise.resolve({ count: 0 } as { count: number }),
    ]);

    docCount = docs.count ?? 0;
    openReminders = reminders.count ?? 0;
    assetCount = assets.count ?? 0;
    passportSections = (sections as { count: number | null }).count ?? 0;
  }

  const hasProperty = Boolean(propertyId);

  // Poctivé znění stavu pasu. Tón odpovídá významu, nikdy nehrozí sankcí.
  const passport: { label: string; tone: StatTone; hint: string } = !hasProperty
    ? {
        label: "Nezaložen",
        tone: "recommended",
        hint: "Založte nemovitost",
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
            tone: "insurance_recommended",
            hint: `${passportSections} ${plural(passportSections, "vyplněná sekce", "vyplněné sekce", "vyplněných sekcí")}`,
          }
        : {
            label: "Připraven",
            tone: "verified",
            hint: `${passportSections} ${plural(passportSections, "vyplněná sekce", "vyplněné sekce", "vyplněných sekcí")}`,
          };

  const cards = [
    {
      label: "Dokumenty",
      value: docCount,
      icon: FileText,
      href: "/dokumenty",
      sub: docCount === 0 ? "Nahrajte první dokument" : `${plural(docCount, "uložený soubor", "uložené soubory", "uložených souborů")}`,
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
      sub: assetCount === 0 ? "Přidejte spotřebiče" : `${plural(assetCount, "evidovaná položka", "evidované položky", "evidovaných položek")}`,
    },
  ] as const;

  // Rychlé akce — vždy míří na existující trasy. Cíl nemovitosti se přizpůsobí,
  // zda už nějakou máte (detail vs. seznam se zakládáním).
  const passportHref = propertyId ? `/nemovitost/${propertyId}` : "/nemovitost";
  const quickActions = [
    {
      label: "Nahrát dokument",
      icon: Upload,
      href: "/dokumenty",
    },
    {
      label: "Přidat majetek fotkou",
      icon: Camera,
      href: "/majetek",
    },
    {
      label: "Spočítat revize",
      icon: BellRing,
      href: "/pripominky",
    },
    {
      label: "Hledat ve svých datech",
      icon: Search,
      href: "/hledat",
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

      {!hasProperty && (
        <Card className="border-honey/40 bg-honey-100/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy">
                <Home size={20} className="text-honey" />
              </span>
              <div>
                <p className="font-display text-base text-ink">
                  Začněte založením nemovitosti
                </p>
                <p className="mt-1 max-w-prose text-sm text-ink-soft">
                  Pas nemovitosti je základ celé aplikace — pak k němu přibydou
                  dokumenty, revize, záruky i vybavení. Adresu i detaily můžete
                  doplnit kdykoliv později.
                </p>
              </div>
            </div>
            <Link
              href="/nemovitost"
              className="btn btn-primary shrink-0 self-start text-sm"
            >
              <Plus size={16} />
              Založit nemovitost
            </Link>
          </div>
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

        <Link href={passportHref} className="block">
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

      {hasProperty && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              Rychlé akce
            </h2>
            <Link
              href="/nemovitost"
              className="inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline"
            >
              Otevřít nemovitost
              <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map(({ label, icon: Icon, href }) => (
              <Link key={label} href={href} className="block">
                <Card className="flex h-full items-center gap-3 transition-colors hover:border-navy/30">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2">
                    <Icon size={18} className="text-navy" />
                  </span>
                  <span className="text-sm font-medium text-ink">{label}</span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// Česká pluralizace (1 / 2–4 / 5+).
function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
