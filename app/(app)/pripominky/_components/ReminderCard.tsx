// Jedna připomínka — poctivý badge dle wording_type, termín, právní základ a
// akce Hotovo / Odložit / Znovu otevřít (server actions). Klíčové je vizuálně
// odlišit, co je ZE ZÁKONA povinné, co jen doporučené a co kvůli pojišťovně.
import {
  ShieldCheck,
  CalendarClock,
  CheckCircle2,
  RotateCcw,
  AlarmClockOff,
  Scale,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { WordingType } from "@/lib/db/types";
import { markDone, reopen, snooze } from "./actions";

export type ReminderRow = {
  id: string;
  title: string;
  due_date: string | null;
  wording_type: WordingType;
  legal_basis: string | null;
  status: "open" | "done" | "dismissed" | "snoozed";
  type: string;
};

// Poctivá slova: nikdy neříkáme "ze zákona musíte", pokud to není legal_required.
const WORDING: Record<
  WordingType,
  { label: string; tone: "legal_required" | "recommended" | "insurance_recommended"; note: string }
> = {
  legal_required: {
    label: "Povinné ze zákona",
    tone: "legal_required",
    note: "Tuto revizi vyžaduje zákon. Při zanedbání hrozí sankce.",
  },
  insurance_recommended: {
    label: "Kvůli pojišťovně",
    tone: "insurance_recommended",
    note: "Není zákonná povinnost, ale pojišťovny ji běžně vyžadují k plnění.",
  },
  recommended: {
    label: "Doporučené",
    tone: "recommended",
    note: "Není povinné — doporučujeme kvůli bezpečnosti a životnosti.",
  },
};

const SNOOZE_OPTIONS = [
  { days: 7, label: "o týden" },
  { days: 30, label: "o měsíc" },
  { days: 90, label: "o 3 měsíce" },
];

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("cs-CZ");
}

function dueState(d: string | null) {
  if (!d) return { label: "termín neurčen", overdue: false };
  const due = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { label: `po termínu (${fmtDate(d)})`, overdue: true };
  if (diffDays === 0) return { label: "dnes", overdue: true };
  if (diffDays <= 30) return { label: `za ${diffDays} dní (${fmtDate(d)})`, overdue: false };
  return { label: fmtDate(d)!, overdue: false };
}

export function ReminderCard({ reminder }: { reminder: ReminderRow }) {
  const w = WORDING[reminder.wording_type];
  const due = dueState(reminder.due_date);
  const open = reminder.status === "open" || reminder.status === "snoozed";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={w.tone}>
              <ShieldCheck size={11} /> {w.label}
            </Badge>
            <span
              className={
                due.overdue
                  ? "inline-flex items-center gap-1 text-xs font-medium text-rust"
                  : "inline-flex items-center gap-1 text-xs text-muted"
              }
            >
              <CalendarClock size={12} /> {due.label}
            </span>
            {reminder.status === "snoozed" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <AlarmClockOff size={12} /> odloženo
              </span>
            )}
          </div>

          <p className="mt-2 text-sm font-medium text-ink">{reminder.title}</p>
          <p className="mt-1 text-xs text-ink-soft">{w.note}</p>

          {reminder.legal_basis && (
            <p className="mt-2 inline-flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
              <Scale size={12} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium text-ink-soft">Právní základ: </span>
                {reminder.legal_basis}
              </span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {open ? (
            <>
              <form action={markDone}>
                <input type="hidden" name="reminderId" value={reminder.id} />
                <Button type="submit" variant="primary" className="w-full">
                  <CheckCircle2 size={15} /> Hotovo
                </Button>
              </form>

              <form action={snooze} className="flex items-center gap-1">
                <input type="hidden" name="reminderId" value={reminder.id} />
                <AlarmClockOff size={14} className="text-muted" />
                <select
                  name="days"
                  defaultValue="30"
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink-soft"
                  aria-label="Odložit připomínku"
                >
                  {SNOOZE_OPTIONS.map((o) => (
                    <option key={o.days} value={o.days}>
                      Odložit {o.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="ghost" className="px-2 py-1.5">
                  OK
                </Button>
              </form>
            </>
          ) : (
            <form action={reopen}>
              <input type="hidden" name="reminderId" value={reminder.id} />
              <Button type="submit" variant="ghost">
                <RotateCcw size={15} /> Znovu otevřít
              </Button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}
