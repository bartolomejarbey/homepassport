// Připomínky / revize — hub. Seznam připomínek seskupený podle stavu
// (otevřené / hotové), každá s termínem a poctivým badge dle wording_type.
// Akce "Spočítat revize" projde kontext nemovitosti a revize pravidla a založí
// kontextové připomínky. Jasně odlišujeme povinné × doporučené × kvůli pojišťovně.
import { BellRing, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReminderCard, type ReminderRow } from "./_components/ReminderCard";
import { GenerateRevizeButton } from "./_components/GenerateRevizeButton";

export const metadata = { title: "Připomínky — Home Passport" };

export default async function PripominkyPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  // Domácnost uživatele → její první nemovitost (cíl pro výpočet revizí).
  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user!.id)
    .limit(1)
    .maybeSingle();
  const householdId = membership?.household_id ?? null;

  let propertyId: string | null = null;
  let reminders: ReminderRow[] = [];

  if (householdId) {
    const { data: ownerLink } = await sb
      .from("property_owners")
      .select("property_id")
      .eq("household_id", householdId)
      .limit(1)
      .maybeSingle();
    propertyId = ownerLink?.property_id ?? null;

    const { data } = await sb
      .from("reminders")
      .select("id, title, due_date, wording_type, legal_basis, status, type")
      .eq("household_id", householdId)
      .order("due_date", { ascending: true, nullsFirst: false });
    reminders = (data as ReminderRow[] | null) ?? [];
  }

  const openReminders = reminders.filter(
    (r) => r.status === "open" || r.status === "snoozed",
  );
  const doneReminders = reminders.filter(
    (r) => r.status === "done" || r.status === "dismissed",
  );

  // Pořadí otevřených: zákonné dřív, pak dle termínu (bez termínu na konec).
  const wordingRank: Record<string, number> = {
    legal_required: 0,
    insurance_recommended: 1,
    recommended: 2,
  };
  openReminders.sort((a, b) => {
    const byWording =
      (wordingRank[a.wording_type] ?? 9) - (wordingRank[b.wording_type] ?? 9);
    if (byWording !== 0) return byWording;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Připomínky</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
            Revize a připomínky
          </h1>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Termíny revizí, záruk a údržby na jednom místě. U každé jasně píšeme,
            zda je <strong className="font-medium text-ink">povinná ze zákona</strong>,
            jen doporučená, nebo ji vyžaduje pojišťovna.
          </p>
        </div>
        {propertyId && <GenerateRevizeButton propertyId={propertyId} />}
      </header>

      {/* Legenda — co která barva znamená. */}
      <Card className="bg-surface-2/60">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5 font-medium text-muted">
            <Info size={13} /> Co znamenají štítky:
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Badge tone="legal_required">Povinné ze zákona</Badge> hrozí sankce
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Badge tone="insurance_recommended">Kvůli pojišťovně</Badge> podmínka plnění
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Badge tone="recommended">Doporučené</Badge> bezpečnost a životnost
          </span>
        </div>
      </Card>

      {!householdId ? (
        <Card className="border-honey/40 bg-honey-100/40">
          <p className="font-display text-base text-ink">
            Zatím nemáte založenou domácnost
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Domácnost vzniká po registraci. Pak založte nemovitost a vyplňte její
            kontext — podle něj spočítáme správné revize.
          </p>
        </Card>
      ) : !propertyId ? (
        <Card className="border-honey/40 bg-honey-100/40">
          <p className="font-display text-base text-ink">
            Nejdřív založte nemovitost
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Revize jsou vázané na konkrétní nemovitost a její využití. Přejděte do
            sekce <strong className="font-medium text-ink">Nemovitost</strong>, založte
            ji a vyplňte kontext — pak zde půjde spočítat revize.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <BellRing size={16} className="text-honey" />
              <h2 className="font-display text-lg font-semibold text-ink">
                Otevřené
              </h2>
              <span className="text-sm text-muted">({openReminders.length})</span>
            </div>

            {openReminders.length === 0 ? (
              <EmptyState
                title="Žádné otevřené připomínky"
                hint="Spusťte výpočet revizí podle kontextu nemovitosti — navrhneme jen to, co se vás opravdu týká."
              />
            ) : (
              <div className="space-y-3">
                {openReminders.map((r) => (
                  <ReminderCard key={r.id} reminder={r} />
                ))}
              </div>
            )}
          </section>

          {doneReminders.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-ink-soft">
                  Hotové
                </h2>
                <span className="text-sm text-muted">({doneReminders.length})</span>
              </div>
              <div className="space-y-3 opacity-75">
                {doneReminders.map((r) => (
                  <ReminderCard key={r.id} reminder={r} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
