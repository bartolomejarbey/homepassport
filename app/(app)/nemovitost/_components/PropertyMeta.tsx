// Presentational helpers shared by the property list & detail (labels, status badge, address).
import { Badge } from "@/components/ui/Badge";

export type PropertyStatus = "draft" | "active" | "transferred" | "archived";
export type PropertyType = "house" | "apartment" | "unit" | "land" | "commercial";

export const TYPE_LABELS: Record<PropertyType, string> = {
  house: "Rodinný dům",
  apartment: "Byt",
  unit: "Jednotka",
  land: "Pozemek",
  commercial: "Komerční prostor",
};

const STATUS_CONFIG: Record<
  PropertyStatus,
  { label: string; tone: "draft" | "verified" | "recommended" | "insurance_recommended" }
> = {
  draft: { label: "Rozpracováno", tone: "draft" },
  active: { label: "Aktivní", tone: "verified" },
  transferred: { label: "Převedeno", tone: "recommended" },
  archived: { label: "Archivováno", tone: "recommended" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[(status as PropertyStatus)] ?? STATUS_CONFIG.draft;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

export function propertyName(p: {
  title: string | null;
  type: string;
  street: string | null;
  city: string | null;
}): string {
  if (p.title && p.title.trim()) return p.title.trim();
  const typeLabel = TYPE_LABELS[(p.type as PropertyType)] ?? "Nemovitost";
  const where = [p.street, p.city].filter(Boolean).join(", ");
  return where ? `${typeLabel} — ${where}` : typeLabel;
}

export function formatAddress(p: {
  street: string | null;
  city: string | null;
  postal_code: string | null;
}): string | null {
  const line = [p.street, [p.postal_code, p.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return line.trim().length ? line : null;
}
