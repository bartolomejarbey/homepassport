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
  CalendarClock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  AttentionReminders,
  type AttentionItem,
} from "../_components/AttentionReminders";

export const metadata = { title: "Přehled — Home Passport" };

// Tóny štítku stavu pasu — podmnožina tónů komponenty Badge.
type StatTone = "verified" | "insurance_recommended" | "recommended";

// Jméno do pozdravu: celé jméno → jeho první část, jinak část e-mailu před @.
// Přihlášený uživatel má vždy e-mail, takže prázdný řetězec je jen pojistka
// (pozdrav pak gracefully degraduje na "Vítejte zpět" bez visící čárky).
function firstName(full: string | null, email: string | null | undefined) {
  const n = (full ?? "").trim();
  if (n) return n.split(/\s+/)[0];
  if (email) return email.split("@")[0];
  return "";
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
  let attention: AttentionItem[] = [];
  let overdueCount = 0;
  let contextReady = false;

  if (householdId) {
    // První nemovitost domácnosti — cíl pro pas i rychlé akce.
    const { data: ownerLink } = await sb
      .from("property_owners")
      .select("property_id")
      .eq("household_id", householdId)
      .limit(1)
      .maybeSingle();
    propertyId = ownerLink?.property_id ?? null;

    // Po termínu = otevřené připomínky s termínem v minulosti. Rows s prázdným
    // termínem (due_date IS NULL) sem v SQL nespadnou — porovnání s NULL je NULL,
    // ne true — takže napočítáme jen to, co už skutečně hoří.
    const todayIso = new Date().toISOString().slice(0, 10);

    const [docs, reminders, assets, dueSoon, overdue, ctx] =
      await Promise.all([
        sb
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId),
        // "Otevřené" = open i snoozed — stejně, jako je seskupuje stránka /pripominky,
        // aby číslo na dlaždici sedělo s tím, co uživatel po prokliku uvidí.
        sb
          .from("reminders")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId)
          .in("status", ["open", "snoozed"]),
        sb
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId),
        // Nejbližší otevřené připomínky pro sekci "Vyžaduje pozornost".
        // Bez termínu řadíme nakonec (nulls last), aby nahoře byly skutečné termíny.
        sb
          .from("reminders")
          .select("id, title, due_date, wording_type")
          .eq("household_id", householdId)
          .in("status", ["open", "snoozed"])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(3),
        sb
          .from("reminders")
          .select("id", { count: "exact", head: true })
          .eq("household_id", householdId)
          .in("status", ["open", "snoozed"])
          .lt("due_date", todayIso),
        // Kontext užívání nemovitosti — řídí poctivý onboarding (viz needsContext).
        // Řádek je nasazen už při založení nemovitosti, ale s prázdným užíváním;
        // „vyplněný“ je až tehdy, když je zaškrtnutý aspoň jeden způsob užívání —
        // stejné kritérium jako /pripominky a detail nemovitosti, ať číslo sedí.
        propertyId
          ? sb
              .from("property_contexts")
              .select("owner_occupied, rental, svj, business_use")
              .eq("property_id", propertyId)
              .maybeSingle()
          : Promise.resolve({
              data: null as {
                owner_occupied: boolean;
                rental: boolean;
                svj: boolean;
                business_use: boolean;
              } | null,
            }),
      ]);

    docCount = docs.count ?? 0;
    openReminders = reminders.count ?? 0;
    assetCount = assets.count ?? 0;
    attention = (dueSoon as { data: AttentionItem[] | null }).data ?? [];
    overdueCount = (overdue as { count: number | null }).count ?? 0;
    const ctxRow = (
      ctx as {
        data: {
          owner_occupied: boolean;
          rental: boolean;
          svj: boolean;
          business_use: boolean;
        } | null;
      }
    ).data;
    contextReady = !!(
      ctxRow &&
      (ctxRow.owner_occupied ||
        ctxRow.rental ||
        ctxRow.svj ||
        ctxRow.business_use)
    );
  }

  const hasProperty = Boolean(propertyId);

  // Stav pasu = poctivá připravenost odvozená z reálných kroků, které uživatel
  // opravdu udělá (a které tu už načítáme): založení nemovitosti, vyplnění
  // kontextu užívání, první dokument, první položka majetku. Záměrně NEpočítáme
  // řádky passport_sections — ty se zatím nikde nezapisují, takže by tón navždy
  // uvázl na nule a stav „Připraven“ by byl nedosažitelný. Tóny odpovídají
  // významu (parchment → honey → teal) a nikdy nehrozí sankcí.
  const milestones = hasProperty
    ? [contextReady, docCount > 0, assetCount > 0]
    : [];
  const doneMilestones = milestones.filter(Boolean).length;
  // +1 za samotné založení nemovitosti, aby krok „máte nemovitost“ nebyl zdarma
  // schovaný — celkem 4 kroky (nemovitost + kontext + dokument + majetek).
  const passportScore = hasProperty ? doneMilestones + 1 : 0;
  const passportTotal = 4;

  const passport: { label: string; tone: StatTone; hint: string } = !hasProperty
    ? {
        label: "Nezaložen",
        tone: "recommended",
        hint: "Založte nemovitost",
      }
    : passportScore >= passportTotal
      ? {
          label: "Připraven",
          tone: "verified",
          hint: "Vše hotové k předání",
        }
      : passportScore >= 2
        ? {
            label: "Rozpracovaný",
            tone: "insurance_recommended",
            hint: `${passportScore} ze ${passportTotal} kroků hotovo`,
          }
        : {
            label: "Začínáme",
            tone: "recommended",
            hint: `${passportScore} ze ${passportTotal} kroků hotovo`,
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
      sub:
        openReminders === 0
          ? "Nic vás nečeká"
          : overdueCount > 0
            ? `${overdueCount} ${plural(overdueCount, "po termínu", "po termínu", "po termínu")}`
            : "k vyřízení",
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
  const kontextHref = propertyId ? `/nemovitost/${propertyId}/kontext` : "/nemovitost";

  // Druhý krok onboardingu: nemovitost už existuje, ale způsob jejího užívání
  // zatím nikdo nevyplnil (kontext nasazený při založení má prázdné užívání).
  // Nejhodnotnější další krok je vyplnit kontext (komín / plyn / využití),
  // protože z něj engine poctivě odvodí revize. Stejné kritérium jako /pripominky
  // a detail nemovitosti, aby nudge zmizel přesně tehdy, co tam.
  // Záměrně nic neslibujeme „ze zákona“ — to řeší až /pripominky dle wording_type.
  const needsContext = hasProperty && !contextReady;
  // needsProperty: akce, které dávají smysl až po založení nemovitosti
  // (revize jsou vázané na konkrétní nemovitost a její využití). Ostatní akce
  // — nahrání dokumentu, přidání majetku fotkou, hledání — fungují i bez ní,
  // takže je nabídneme hned, aby přehled nezel prázdnotou už od začátku.
  const quickActions = [
    {
      label: "Nahrát dokument",
      icon: Upload,
      href: "/dokumenty",
      needsProperty: false,
    },
    {
      label: "Přidat majetek fotkou",
      icon: Camera,
      href: "/majetek",
      needsProperty: false,
    },
    // Dokud není vyplněný kontext užívání, posíláme rovnou na dotazník — odtud
    // engine poctivě odvodí revize. Akce tak nikdy neústí do slepé uličky.
    contextReady
      ? {
          label: "Spočítat revize",
          icon: CalendarClock,
          href: "/pripominky",
          needsProperty: true,
        }
      : {
          label: "Nastavit revize",
          icon: CalendarClock,
          href: kontextHref,
          needsProperty: true,
        },
    {
      label: "Hledat ve svých datech",
      icon: Search,
      href: "/hledat",
      needsProperty: false,
    },
  ] as const;
  const visibleActions = quickActions.filter(
    (a) => hasProperty || !a.needsProperty,
  );

  const greetingName = firstName(profile?.full_name ?? null, user?.email);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">Přehled</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          {greetingName ? `Vítejte zpět, ${greetingName}` : "Vítejte zpět"}
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

      {needsContext && (
        <Card className="border-honey/40 bg-honey-100/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy">
                <CalendarClock size={20} className="text-honey" />
              </span>
              <div>
                <p className="font-display text-base text-ink">
                  Doplňte kontext nemovitosti
                </p>
                <p className="mt-1 max-w-prose text-sm text-ink-soft">
                  Pár otázek o vytápění, plynu a způsobu užívání nám stačí, abychom
                  vám sestavili připomínky revizí na míru — bez strašení paragrafy,
                  jen to, co se vás opravdu týká.
                </p>
              </div>
            </div>
            <Link
              href={kontextHref}
              className="btn btn-primary shrink-0 self-start text-sm"
            >
              <ArrowRight size={16} />
              Vyplnit kontext
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

      <AttentionReminders items={attention} />

      {householdId && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">
              Rychlé akce
            </h2>
            {hasProperty && (
              <Link
                href={passportHref}
                className="inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline"
              >
                Otevřít nemovitost
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleActions.map(({ label, icon: Icon, href }) => (
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
