// Pure display helpers for B2B property rows (no server/client boundary).
export type ProProperty = {
  id: string;
  type: string;
  title: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  status: string;
  created_at?: string | null;
};

export const TYPE_LABELS: Record<string, string> = {
  house: "Rodinný dům",
  apartment: "Byt",
  unit: "Jednotka",
  land: "Pozemek",
  commercial: "Komerční prostor",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Rozpracováno",
  active: "Aktivní",
  transferred: "Předáno",
  archived: "Archivováno",
};

export function propertyName(p: ProProperty): string {
  if (p.title?.trim()) return p.title.trim();
  const type = TYPE_LABELS[p.type] ?? "Nemovitost";
  return p.city?.trim() ? `${type} — ${p.city.trim()}` : type;
}

export function formatAddress(p: ProProperty): string {
  return [p.street, [p.postal_code, p.city].filter(Boolean).join(" ")]
    .filter((s) => s && s.trim())
    .join(", ");
}
