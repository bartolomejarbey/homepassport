// Pure parts of POST /api/revize/generate, factored out so the dedup / supersede
// algorithm can be unit-tested without a Supabase client. The route still owns
// all I/O (auth, reads, writes, audit); it just delegates these decisions here.
//
// Every function below is behaviour-preserving relative to the inline logic that
// previously lived in the route — see app/api/revize/generate/route.ts.
import type { ReminderDraft } from "@/lib/db/types";

/** A reminder draft as produced by buildReminderDrafts(). */
type Draft = ReminderDraft;

/** Minimal shape of an existing reminder row the dedup/supersede logic needs. */
export interface ExistingReminder {
  id: string;
  title: string;
  legal_basis: string | null;
  status: string;
}

/** Minimal shape of a revision rule needed to map legal_basis -> system_type. */
export interface RuleBasis {
  system_type: string;
  legal_basis: string | null;
}

// Lower number = stronger obligation. When two rules target the same system
// (e.g. a type-specific rule plus a universal one), we keep the strongest so the
// UI never shows "doporučeno" next to "ze zákona" for one system.
export const wordingPriority: Record<string, number> = {
  legal_required: 0,
  insurance_recommended: 1,
  recommended: 2,
};

/** A reminder is "active" (and thus blocks a duplicate) only while open/snoozed. */
export function isActiveStatus(s: string): boolean {
  return s === "open" || s === "snoozed";
}

/**
 * Dedup key for a reminder. reminders has no system_type column, so identity is
 * title + legal_basis (1:1 per rule in a given usage context). Kept as a single
 * helper so the route's "seen" set and the insert filter can never drift apart.
 */
export function reminderKey(title: string, legalBasis: string | null | undefined): string {
  return `${title} ${legalBasis ?? ""}`;
}

/**
 * Collapse drafts to at most one per system, keeping the strongest wording.
 * Mirrors the bySystem Map loop in the route: first draft wins ties (a later
 * draft replaces only on a STRICTLY higher obligation), preserving order.
 */
export function collapseBySystem(drafts: Draft[]): Draft[] {
  const bySystem = new Map<string, Draft>();
  for (const d of drafts) {
    const prev = bySystem.get(d.system_type);
    if (
      !prev ||
      (wordingPriority[d.wording_type] ?? 9) < (wordingPriority[prev.wording_type] ?? 9)
    ) {
      bySystem.set(d.system_type, d);
    }
  }
  return [...bySystem.values()];
}

/**
 * Decide which existing reminders to supersede ('dismissed'). An active,
 * system-recognisable reminder is superseded when the legal_basis now in force
 * for its system differs from the one it carries — covering both:
 *   1) usage changed (owner -> rental) so wording/basis flipped for a kept system,
 *   2) the system was removed / has no rule in the new usage (active basis = null).
 * Reminders whose system we cannot infer from legal_basis are left untouched
 * (they may be hand-added). Pure: returns the ids; the route does the UPDATE.
 */
export function computeSupersededIds(
  existing: ExistingReminder[],
  drafts: Draft[],
  rules: RuleBasis[],
): string[] {
  const basisToSystem = new Map<string, string>();
  for (const r of rules) {
    if (r.legal_basis) basisToSystem.set(r.legal_basis, r.system_type);
  }
  const newBasisBySystem = new Map<string, string | null>();
  for (const d of drafts) newBasisBySystem.set(d.system_type, d.legal_basis);

  return existing
    .filter((r) => isActiveStatus(r.status))
    .filter((r) => {
      const sys = r.legal_basis ? basisToSystem.get(r.legal_basis) : undefined;
      if (!sys) return false;
      const activeBasis = newBasisBySystem.has(sys) ? newBasisBySystem.get(sys) : null;
      return activeBasis !== (r.legal_basis ?? null);
    })
    .map((r) => r.id);
}

/**
 * The "seen" set of active reminder keys, excluding any ids being superseded
 * (those no longer block a fresh wording). Mirrors the route's seen-set build
 * plus its post-supersede seen.delete() pass, as one pure step.
 */
export function buildSeenKeys(
  existing: ExistingReminder[],
  supersededIds: Iterable<string>,
): Set<string> {
  const dropped = new Set(supersededIds);
  const seen = new Set<string>();
  for (const r of existing) {
    if (!isActiveStatus(r.status)) continue;
    if (dropped.has(r.id)) continue;
    seen.add(reminderKey(r.title, r.legal_basis));
  }
  return seen;
}

/**
 * Suggested first due date: today + interval_months (null/<=0 interval => no date).
 * Formatted locally (not toISOString) — due_date is a calendar day, so the stored
 * value matches what the user sees with no timezone shift. `now` is injectable for
 * deterministic tests; production passes the default (new Date()).
 */
export function suggestDueDate(intervalMonths: number | null, now: Date = new Date()): string | null {
  if (!intervalMonths || intervalMonths <= 0) return null;
  const d = new Date(now);
  d.setMonth(d.getMonth() + intervalMonths);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
