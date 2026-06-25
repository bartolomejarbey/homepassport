import type { PropertyContext, RevisionRule, ReminderDraft, UsageContext, SystemType } from "@/lib/db/types";

/** Pick the active usage context (priority: business > svj > rental > owner_occupied). */
export function activeUsage(ctx: PropertyContext): UsageContext {
  if (ctx.business_use) return "business";
  if (ctx.svj) return "svj";
  if (ctx.rental) return "rental";
  return "owner_occupied";
}

/** Which systems are present in this property. */
function presentSystems(ctx: PropertyContext): SystemType[] {
  const s: SystemType[] = [];
  if (ctx.has_chimney) s.push("chimney");
  if (ctx.has_gas) s.push("gas");
  if (ctx.has_electrical) s.push("electrical");
  if (ctx.has_lps) s.push("lps");
  if (ctx.has_pv) s.push("pv");
  return s;
}

/**
 * Core honesty rule (from legal research): reminders are CONTEXTUAL.
 * For an owner-occupied family home only the chimney is genuinely
 * "legal_required"; gas/electrical surface as recommended / insurance.
 */
export function buildReminderDrafts(ctx: PropertyContext, rules: RevisionRule[]): ReminderDraft[] {
  const usage = activeUsage(ctx);
  const systems = new Set(presentSystems(ctx));
  return rules
    .filter((r) => r.usage_context === usage && systems.has(r.system_type))
    .map((r) => ({
      system_type: r.system_type,
      title: r.message,
      wording_type: r.wording_type,
      legal_basis: r.legal_basis,
      interval_months: r.interval_months,
      message: r.interval_note ?? r.message,
    }));
}
