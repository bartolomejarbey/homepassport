// Renders passport_sections grouped into the six canonical passport groups.
import {
  Hammer,
  Cpu,
  Gauge,
  ShieldCheck,
  FileBadge,
  Sofa,
  type LucideIcon,
} from "lucide-react";

export interface PassportSectionRow {
  id: string;
  kind: string;
  title: string | null;
  data: Record<string, unknown> | null;
}

// kind (DB) -> human group. Several DB kinds can map into one visual group.
const GROUPS: {
  id: string;
  label: string;
  icon: LucideIcon;
  kinds: string[];
  hint: string;
}[] = [
  {
    id: "construction",
    label: "Konstrukce",
    icon: Hammer,
    kinds: ["construction"],
    hint: "Stavba, materiály, dispozice.",
  },
  {
    id: "technology",
    label: "Technologie",
    icon: Cpu,
    kinds: ["technology"],
    hint: "Vytápění, rozvody, systémy.",
  },
  {
    id: "penb",
    label: "PENB",
    icon: Gauge,
    kinds: ["penb"],
    hint: "Průkaz energetické náročnosti budovy.",
  },
  {
    id: "inspections",
    label: "Revize",
    icon: ShieldCheck,
    kinds: ["inspections"],
    hint: "Revizní zprávy a kontroly.",
  },
  {
    id: "warranties",
    label: "Záruky",
    icon: FileBadge,
    kinds: ["warranties", "manuals"],
    hint: "Záruční listy a návody.",
  },
  {
    id: "equipment",
    label: "Vybavení",
    icon: Sofa,
    kinds: ["equipment"],
    hint: "Pevné vybavení nemovitosti.",
  },
];

function sectionSummary(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const s = (data as Record<string, unknown>)["summary"];
  if (typeof s === "string" && s.trim()) return s.trim();
  const keys = Object.keys(data).length;
  return keys ? `${keys} údajů` : null;
}

export function PassportSections({ sections }: { sections: PassportSectionRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {GROUPS.map((g) => {
        const items = sections.filter((s) => g.kinds.includes(s.kind));
        const Icon = g.icon;
        return (
          <div key={g.id} className="card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2">
                  <Icon size={18} className="text-honey" />
                </span>
                <div>
                  <h3 className="font-display text-base font-semibold text-ink">
                    {g.label}
                  </h3>
                  <p className="text-xs text-muted">{g.hint}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-muted">
                {items.length}
              </span>
            </div>

            {items.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-line bg-surface-2/50 px-3 py-2 text-xs text-muted">
                Zatím nevyplněno
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {items.map((s) => {
                  const summary = sectionSummary(s.data);
                  return (
                    <li
                      key={s.id}
                      className="rounded-md border border-line bg-surface px-3 py-2"
                    >
                      <p className="text-sm font-medium text-ink">
                        {s.title ?? g.label}
                      </p>
                      {summary && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
                          {summary}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
