// Sekce "Vyžaduje pozornost" na přehledu — pár nejbližších otevřených připomínek.
// Čistě prezentační (server). Data jí předává stránka /prehled, která je čte přes
// RLS-respektujícího klienta. Badge a slova vždy odpovídají wording_type — nikdy
// neříkáme "ze zákona", pokud to legal_required není (tvrdé pravidlo revizí).
import Link from "next/link";
import { CalendarClock, ShieldCheck, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { WordingType } from "@/lib/db/types";

export type AttentionItem = {
  id: string;
  title: string;
  due_date: string | null;
  wording_type: WordingType;
};

// Poctivé štítky — shodné s /pripominky, aby uživatel viděl stejná slova všude.
const WORDING: Record<WordingType, { label: string; tone: WordingType }> = {
  legal_required: { label: "Povinné ze zákona", tone: "legal_required" },
  insurance_recommended: { label: "Kvůli pojišťovně", tone: "insurance_recommended" },
  recommended: { label: "Doporučené", tone: "recommended" },
};

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("cs-CZ");
}

// Stav termínu — stejná logika dnů jako v ReminderCard, jen kratší pro přehled.
function dueState(d: string | null): { label: string; overdue: boolean } {
  if (!d) return { label: "termín neurčen", overdue: false };
  const due = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { label: `po termínu (${fmtDate(d)})`, overdue: true };
  if (diffDays === 0) return { label: "dnes", overdue: true };
  if (diffDays <= 30) return { label: `za ${diffDays} dní`, overdue: false };
  return { label: fmtDate(d), overdue: false };
}

export function AttentionReminders({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">
          Vyžaduje pozornost
        </h2>
        <Link
          href="/pripominky"
          className="inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline"
        >
          Všechny připomínky
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const w = WORDING[item.wording_type];
          const due = dueState(item.due_date);
          return (
            <Link key={item.id} href="/pripominky" className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:border-navy/30">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.title}
                  </p>
                  <span
                    className={
                      due.overdue
                        ? "mt-1 inline-flex items-center gap-1 text-xs font-medium text-rust"
                        : "mt-1 inline-flex items-center gap-1 text-xs text-muted"
                    }
                  >
                    <CalendarClock size={12} /> {due.label}
                  </span>
                </div>
                <Badge tone={w.tone}>
                  <ShieldCheck size={11} /> {w.label}
                </Badge>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
