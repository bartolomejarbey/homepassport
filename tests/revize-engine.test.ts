import { describe, it, expect } from "vitest";
import { buildReminderDrafts, activeUsage } from "@/lib/revize/engine";
import type { PropertyContext, RevisionRule } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Fixtures mirror supabase/seed.sql exactly. In production the property_type +
// country filtering happens in the SQL query (see app/api/revize/generate/route.ts);
// buildReminderDrafts() is the pure function that then filters by the ACTIVE
// usage context + present systems. So each `rules` fixture below is the set a
// query would return for that property_type, and the assertions exercise the
// honesty matrix the engine is responsible for.
// ---------------------------------------------------------------------------

function baseProperty(overrides: Partial<PropertyContext> = {}): PropertyContext {
  return {
    property_id: "prop-1",
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
    ...overrides,
  };
}

function rule(overrides: Partial<RevisionRule>): RevisionRule {
  return {
    id: crypto.randomUUID(),
    country: "CZ",
    property_type: "house",
    usage_context: "owner_occupied",
    system_type: "chimney",
    interval_months: 12,
    interval_note: null,
    wording_type: "legal_required",
    legal_basis: null,
    message: "msg",
    ...overrides,
  };
}

// Rules a query for property_type='house' would return (seed.sql lines 5,8-16).
const HOUSE_RULES: RevisionRule[] = [
  rule({
    system_type: "chimney",
    usage_context: "owner_occupied",
    interval_months: 12,
    wording_type: "legal_required",
    legal_basis: "Vyhláška č. 34/2016 Sb. (zák. 320/2015 Sb.)",
    message: "Kontrola spalinové cesty — zákonná povinnost. Sankce až 50 000 Kč (FO).",
    interval_note: "Pevná paliva: čištění 3×/rok + kontrola 1×/rok",
  }),
  rule({
    system_type: "gas",
    usage_context: "owner_occupied",
    interval_months: 36,
    wording_type: "insurance_recommended",
    legal_basis: "§19 NV 191/2022 Sb. — vlastníci RD/bytů vyňati",
    message: "Revize plynu — není ze zákona povinná pro váš dům, ale pojišťovny ji běžně vyžadují.",
  }),
  rule({
    system_type: "gas",
    usage_context: "rental",
    interval_months: 36,
    wording_type: "legal_required",
    legal_basis: "NV 191/2022 Sb. (zák. 250/2021 Sb.)",
    message: "U pronájmu se stává povinnou — provozní revize plynu.",
  }),
  rule({
    system_type: "gas",
    usage_context: "svj",
    interval_months: 36,
    wording_type: "legal_required",
    legal_basis: "NV 191/2022 Sb.",
    message: "U SVJ/bytového domu povinná provozní revize plynu.",
  }),
  rule({
    system_type: "electrical",
    usage_context: "owner_occupied",
    interval_months: 60,
    wording_type: "insurance_recommended",
    legal_basis: "NV 190/2022 Sb. / ČSN 33 1500",
    message: "Revize elektroinstalace — doporučeno, často podmínka pojistného plnění.",
  }),
  rule({
    system_type: "electrical",
    usage_context: "rental",
    interval_months: 60,
    wording_type: "legal_required",
    legal_basis: "NV 190/2022 Sb. (zák. 250/2021 Sb.)",
    message: "U pronájmu povinná pravidelná revize elektroinstalace.",
  }),
  rule({
    system_type: "electrical",
    usage_context: "business",
    interval_months: 36,
    wording_type: "legal_required",
    legal_basis: "NV 190/2022 Sb.",
    message: "U podnikání povinná pravidelná revize elektroinstalace.",
  }),
  rule({
    system_type: "lps",
    usage_context: "owner_occupied",
    interval_months: 48,
    wording_type: "recommended",
    legal_basis: "ČSN EN 62305",
    message: "Revize hromosvodu — doporučeno dle třídy ochrany.",
  }),
];

// Rules a query for property_type='apartment' would return (seed.sql line 6 only).
const APARTMENT_RULES: RevisionRule[] = [
  rule({
    property_type: "apartment",
    system_type: "chimney",
    usage_context: "owner_occupied",
    interval_months: 12,
    wording_type: "legal_required",
    legal_basis: "Vyhláška č. 34/2016 Sb.",
    message: "Kontrola spalinové cesty — zákonná povinnost.",
    interval_note: "Dle paliva připojeného spotřebiče",
  }),
];

function wordingBySystem(drafts: ReturnType<typeof buildReminderDrafts>) {
  return Object.fromEntries(drafts.map((d) => [d.system_type, d.wording_type]));
}

describe("activeUsage", () => {
  it("defaults to owner_occupied", () => {
    expect(activeUsage(baseProperty())).toBe("owner_occupied");
  });

  it("returns rental when only rental flag is set", () => {
    expect(activeUsage(baseProperty({ owner_occupied: false, rental: true }))).toBe("rental");
  });

  it("returns svj over rental", () => {
    expect(activeUsage(baseProperty({ rental: true, svj: true }))).toBe("svj");
  });

  it("returns business with highest priority (business > svj > rental > owner)", () => {
    expect(
      activeUsage(baseProperty({ rental: true, svj: true, business_use: true })),
    ).toBe("business");
  });
});

describe("buildReminderDrafts — owner-occupied house (the honesty matrix)", () => {
  const ctx = baseProperty({
    has_chimney: true,
    has_gas: true,
    has_electrical: true,
  });
  const drafts = buildReminderDrafts(ctx, HOUSE_RULES);
  const bySystem = wordingBySystem(drafts);

  it("fires exactly chimney, gas, electrical (LPS absent because has_lps=false)", () => {
    expect(drafts.map((d) => d.system_type).sort()).toEqual(["chimney", "electrical", "gas"]);
  });

  it("marks ONLY the chimney as legal_required", () => {
    expect(bySystem.chimney).toBe("legal_required");
    const legal = drafts.filter((d) => d.wording_type === "legal_required");
    expect(legal.map((d) => d.system_type)).toEqual(["chimney"]);
  });

  it("marks gas and electrical as insurance_recommended (not mandatory for owners)", () => {
    expect(bySystem.gas).toBe("insurance_recommended");
    expect(bySystem.electrical).toBe("insurance_recommended");
  });

  it("carries legal_basis and interval through from the rule", () => {
    const chimney = drafts.find((d) => d.system_type === "chimney")!;
    expect(chimney.legal_basis).toContain("34/2016");
    expect(chimney.interval_months).toBe(12);
    // message falls back to interval_note when present (engine line 38).
    expect(chimney.message).toContain("Pevná paliva");
  });

  it("does not surface rental/svj/business variants for an owner", () => {
    // gas has 3 rules in HOUSE_RULES; only the owner_occupied one must appear.
    const gasDrafts = drafts.filter((d) => d.system_type === "gas");
    expect(gasDrafts).toHaveLength(1);
    expect(gasDrafts[0].message).toContain("pojišťovny");
  });
});

describe("buildReminderDrafts — rental house", () => {
  const ctx = baseProperty({
    owner_occupied: false,
    rental: true,
    has_chimney: true,
    has_gas: true,
    has_electrical: true,
  });
  const drafts = buildReminderDrafts(ctx, HOUSE_RULES);
  const bySystem = wordingBySystem(drafts);

  it("promotes gas and electrical to legal_required under rental", () => {
    expect(bySystem.gas).toBe("legal_required");
    expect(bySystem.electrical).toBe("legal_required");
  });

  it("does NOT fire chimney for rental (no rental chimney rule in seed)", () => {
    // Honest mirror of seed.sql: chimney is only seeded for owner_occupied.
    expect(bySystem.chimney).toBeUndefined();
    expect(drafts.map((d) => d.system_type).sort()).toEqual(["electrical", "gas"]);
  });
});

describe("buildReminderDrafts — apartment", () => {
  it("fires only the chimney even when gas/electrical are present", () => {
    const ctx = baseProperty({
      has_chimney: true,
      has_gas: true,
      has_electrical: true,
    });
    const drafts = buildReminderDrafts(ctx, APARTMENT_RULES);
    expect(drafts.map((d) => d.system_type)).toEqual(["chimney"]);
    expect(drafts[0].wording_type).toBe("legal_required");
  });
});

describe("buildReminderDrafts — unit / land / commercial (no seeded rules)", () => {
  // These property types have NO rows in seed.sql, so the upstream query returns
  // an empty rule set and the engine must produce zero drafts regardless of systems.
  const fullySystemed = baseProperty({
    has_chimney: true,
    has_gas: true,
    has_electrical: true,
    has_lps: true,
    has_pv: true,
  });

  for (const usage of ["owner_occupied", "rental", "svj", "business"] as const) {
    it(`fires no rules for an empty rule set (usage=${usage})`, () => {
      const ctx =
        usage === "owner_occupied"
          ? fullySystemed
          : baseProperty({
              ...fullySystemed,
              owner_occupied: false,
              rental: usage === "rental",
              svj: usage === "svj",
              business_use: usage === "business",
            });
      expect(buildReminderDrafts(ctx, [])).toEqual([]);
    });
  }
});

describe("buildReminderDrafts — system presence gating", () => {
  it("omits systems that are not physically present", () => {
    // Owner house but ONLY gas present -> only the gas draft, nothing else.
    const ctx = baseProperty({ has_gas: true });
    const drafts = buildReminderDrafts(ctx, HOUSE_RULES);
    expect(drafts.map((d) => d.system_type)).toEqual(["gas"]);
    expect(drafts[0].wording_type).toBe("insurance_recommended");
  });

  it("returns nothing when no systems are present", () => {
    expect(buildReminderDrafts(baseProperty(), HOUSE_RULES)).toEqual([]);
  });
});
