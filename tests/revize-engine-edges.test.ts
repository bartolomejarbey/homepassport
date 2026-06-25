import { describe, it, expect } from "vitest";
import { buildReminderDrafts, activeUsage } from "@/lib/revize/engine";
import type { PropertyContext, RevisionRule } from "@/lib/db/types";

// Supplementary engine edge cases the task calls out explicitly:
//   - business usage takes priority AND actually drives the drafts (not just the
//     activeUsage() label), and
//   - "no systems present" / "no rules" produce zero drafts across usages.
// Kept separate from revize-engine.test.ts so the honesty-matrix fixtures there
// stay focused.

function prop(over: Partial<PropertyContext> = {}): PropertyContext {
  return {
    property_id: "p1",
    owner_occupied: true,
    rental: false,
    svj: false,
    business_use: false,
    has_chimney: false,
    chimney_fuel: null,
    has_gas: false,
    has_electrical: false,
    has_lps: false,
    has_pv: false,
    ...over,
  };
}

function rule(over: Partial<RevisionRule>): RevisionRule {
  return {
    id: crypto.randomUUID(),
    country: "CZ",
    property_type: "house",
    usage_context: "owner_occupied",
    system_type: "electrical",
    interval_months: 60,
    interval_note: null,
    wording_type: "recommended",
    legal_basis: null,
    message: "m",
    ...over,
  };
}

// Electrical seeded for all four usages with different intervals/wording — the
// engine must select strictly the row matching the ACTIVE usage.
const ELEC_RULES: RevisionRule[] = [
  rule({ usage_context: "owner_occupied", wording_type: "insurance_recommended", interval_months: 60, message: "owner" }),
  rule({ usage_context: "rental", wording_type: "legal_required", interval_months: 60, message: "rental" }),
  rule({ usage_context: "business", wording_type: "legal_required", interval_months: 36, message: "business" }),
];

describe("buildReminderDrafts — business usage priority drives selection", () => {
  it("business beats every other flag and selects the business electrical rule", () => {
    const ctx = prop({
      owner_occupied: true,
      rental: true,
      svj: true,
      business_use: true,
      has_electrical: true,
    });
    expect(activeUsage(ctx)).toBe("business");
    const drafts = buildReminderDrafts(ctx, ELEC_RULES);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].system_type).toBe("electrical");
    expect(drafts[0].wording_type).toBe("legal_required");
    // business interval is the 36-month one (proves the business ROW was picked,
    // not merely some legal_required electrical row).
    expect(drafts[0].interval_months).toBe(36);
    expect(drafts[0].title).toBe("business");
  });

  it("does not pick the business rule when business_use is false (rental wins next)", () => {
    const ctx = prop({ owner_occupied: false, rental: true, has_electrical: true });
    const drafts = buildReminderDrafts(ctx, ELEC_RULES);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].interval_months).toBe(60);
    expect(drafts[0].title).toBe("rental");
  });
});

describe("buildReminderDrafts — no systems present", () => {
  it("returns [] when business usage is active but no system is present", () => {
    const ctx = prop({ owner_occupied: false, business_use: true }); // all has_* false
    expect(buildReminderDrafts(ctx, ELEC_RULES)).toEqual([]);
  });

  it("returns [] when a system is present but no rule matches the active usage", () => {
    // svj is active, but ELEC_RULES has no svj electrical rule.
    const ctx = prop({ owner_occupied: false, svj: true, has_electrical: true });
    expect(buildReminderDrafts(ctx, ELEC_RULES)).toEqual([]);
  });

  it("returns [] for an empty rule set regardless of present systems", () => {
    const ctx = prop({ has_electrical: true, has_gas: true, has_chimney: true });
    expect(buildReminderDrafts(ctx, [])).toEqual([]);
  });
});
