import { cn } from "@/lib/utils/cn";
const tones = {
  legal_required: "bg-rust-100 text-rust",
  recommended: "bg-surface-2 text-ink-soft",
  insurance_recommended: "bg-honey-100 text-honey-600",
  verified: "bg-teal-100 text-teal",
  draft: "bg-surface-2 text-muted",
} as const;
export function Badge({ tone = "recommended", children }:
  { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={cn("badge", tones[tone])}>{children}</span>;
}
