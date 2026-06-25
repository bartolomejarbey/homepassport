import { describe, it, expect } from "vitest";
import {
  collapseBySystem,
  computeSupersededIds,
  buildSeenKeys,
  reminderKey,
  isActiveStatus,
  suggestDueDate,
  type ExistingReminder,
  type RuleBasis,
} from "@/lib/revize/dedup";
import type { ReminderDraft } from "@/lib/db/types";

// These mirror the dedup/supersede shape pulled out of
// app/api/revize/generate/route.ts. The route owns the DB I/O; here we pin the
// decisions: collapse multiple rules per system to the strongest wording, retire
// (supersede) reminders whose legal basis no longer matches, and never re-insert a
// duplicate of an active reminder.

function draft(over: Partial<ReminderDraft>): ReminderDraft {
  return {
    system_type: "gas",
    title: "Revize plynu",
    wording_type: "recommended",
    legal_basis: "NV 191/2022",
    interval_months: 36,
    message: "Revize plynu",
    ...over,
  };
}

function existing(over: Partial<ExistingReminder>): ExistingReminder {
  return {
    id: crypto.randomUUID(),
    title: "Revize plynu",
    legal_basis: "NV 191/2022",
    status: "open",
    ...over,
  };
}

describe("isActiveStatus", () => {
  it("treats open and snoozed as active (blocking) statuses", () => {
    expect(isActiveStatus("open")).toBe(true);
    expect(isActiveStatus("snoozed")).toBe(true);
  });
  it("treats done / dismissed / anything else as inactive", () => {
    expect(isActiveStatus("done")).toBe(false);
    expect(isActiveStatus("dismissed")).toBe(false);
    expect(isActiveStatus("revoked")).toBe(false);
    expect(isActiveStatus("")).toBe(false);
  });
});

describe("reminderKey", () => {
  it("joins title and legal_basis", () => {
    expect(reminderKey("Revize plynu", "NV 191/2022")).toBe("Revize plynu NV 191/2022");
  });
  it("treats null/undefined legal_basis as empty (stable key)", () => {
    expect(reminderKey("Komín", null)).toBe("Komín ");
    expect(reminderKey("Komín", undefined)).toBe("Komín ");
  });
});

describe("collapseBySystem — at most one draft per system, strongest wording wins", () => {
  it("keeps a single draft untouched", () => {
    const out = collapseBySystem([draft({ system_type: "gas" })]);
    expect(out).toHaveLength(1);
    expect(out[0].system_type).toBe("gas");
  });

  it("collapses two rules for the same system to legal_required over recommended", () => {
    const out = collapseBySystem([
      draft({ system_type: "gas", wording_type: "recommended", legal_basis: "univ" }),
      draft({ system_type: "gas", wording_type: "legal_required", legal_basis: "house" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].wording_type).toBe("legal_required");
    expect(out[0].legal_basis).toBe("house");
  });

  it("prefers legal_required over insurance_recommended regardless of order", () => {
    const a = collapseBySystem([
      draft({ system_type: "electrical", wording_type: "legal_required" }),
      draft({ system_type: "electrical", wording_type: "insurance_recommended" }),
    ]);
    const b = collapseBySystem([
      draft({ system_type: "electrical", wording_type: "insurance_recommended" }),
      draft({ system_type: "electrical", wording_type: "legal_required" }),
    ]);
    expect(a[0].wording_type).toBe("legal_required");
    expect(b[0].wording_type).toBe("legal_required");
  });

  it("on equal priority keeps the FIRST (no replacement on a tie)", () => {
    const out = collapseBySystem([
      draft({ system_type: "gas", wording_type: "recommended", legal_basis: "first" }),
      draft({ system_type: "gas", wording_type: "recommended", legal_basis: "second" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].legal_basis).toBe("first");
  });

  it("keeps distinct systems and preserves first-seen order", () => {
    const out = collapseBySystem([
      draft({ system_type: "chimney" }),
      draft({ system_type: "gas" }),
      draft({ system_type: "electrical" }),
    ]);
    expect(out.map((d) => d.system_type)).toEqual(["chimney", "gas", "electrical"]);
  });

  it("returns [] for no drafts", () => {
    expect(collapseBySystem([])).toEqual([]);
  });

  it("treats an unknown wording_type as the weakest (loses to any known one)", () => {
    const out = collapseBySystem([
      draft({ system_type: "gas", wording_type: "weird_unknown" as never, legal_basis: "weird" }),
      draft({ system_type: "gas", wording_type: "recommended", legal_basis: "known" }),
    ]);
    expect(out[0].legal_basis).toBe("known");
  });
});

describe("computeSupersededIds — retire reminders whose legal basis no longer holds", () => {
  const rules: RuleBasis[] = [
    { system_type: "gas", legal_basis: "NV 191/2022 owner" },
    { system_type: "gas", legal_basis: "NV 191/2022 rental" },
    { system_type: "chimney", legal_basis: "Vyhláška 34/2016" },
  ];

  it("supersedes nothing when the active basis matches the existing one", () => {
    const drafts = [draft({ system_type: "gas", legal_basis: "NV 191/2022 owner" })];
    const ex = [existing({ legal_basis: "NV 191/2022 owner" })];
    expect(computeSupersededIds(ex, drafts, rules)).toEqual([]);
  });

  it("supersedes when usage flipped and the basis for the kept system changed", () => {
    // owner -> rental: gas system stays, but its legal basis is now the rental one.
    const drafts = [draft({ system_type: "gas", legal_basis: "NV 191/2022 rental" })];
    const stale = existing({ legal_basis: "NV 191/2022 owner" });
    expect(computeSupersededIds([stale], drafts, rules)).toEqual([stale.id]);
  });

  it("supersedes when the system was removed (no draft for it now -> active basis null)", () => {
    const stale = existing({ legal_basis: "NV 191/2022 owner" });
    expect(computeSupersededIds([stale], [], rules)).toEqual([stale.id]);
  });

  it("ignores reminders whose system cannot be inferred (hand-added / unknown basis)", () => {
    const manual = existing({ legal_basis: "ručně přidaná poznámka" });
    expect(computeSupersededIds([manual], [], rules)).toEqual([]);
  });

  it("ignores reminders with a null legal_basis (cannot map to a system)", () => {
    const noBasis = existing({ legal_basis: null });
    expect(computeSupersededIds([noBasis], [], rules)).toEqual([]);
  });

  it("never supersedes inactive (done/dismissed) reminders", () => {
    const done = existing({ legal_basis: "NV 191/2022 owner", status: "done" });
    const dismissed = existing({ legal_basis: "NV 191/2022 owner", status: "dismissed" });
    expect(computeSupersededIds([done, dismissed], [], rules)).toEqual([]);
  });

  it("returns only the changed ids out of a mixed set", () => {
    const keep = existing({ legal_basis: "NV 191/2022 owner" }); // matches active draft
    const change = existing({ legal_basis: "Vyhláška 34/2016" }); // chimney removed
    const drafts = [draft({ system_type: "gas", legal_basis: "NV 191/2022 owner" })];
    expect(computeSupersededIds([keep, change], drafts, rules)).toEqual([change.id]);
  });
});

describe("buildSeenKeys — active keys minus the ones being superseded", () => {
  it("includes active reminders, keyed by title+basis", () => {
    const a = existing({ title: "Revize plynu", legal_basis: "b1" });
    const seen = buildSeenKeys([a], []);
    expect(seen.has("Revize plynu b1")).toBe(true);
    expect(seen.size).toBe(1);
  });

  it("excludes done/dismissed reminders", () => {
    const done = existing({ status: "done" });
    const dismissed = existing({ status: "dismissed" });
    expect(buildSeenKeys([done, dismissed], []).size).toBe(0);
  });

  it("excludes ids that are being superseded so a fresh wording can re-insert", () => {
    const superseded = existing({ title: "Revize plynu", legal_basis: "old" });
    const other = existing({ title: "Komín", legal_basis: "ch" });
    const seen = buildSeenKeys([superseded, other], [superseded.id]);
    expect(seen.has("Revize plynu old")).toBe(false);
    expect(seen.has("Komín ch")).toBe(true);
  });
});

describe("collapse + seen integration — duplicate active reminder is not re-inserted", () => {
  it("filters a draft whose key already exists and is active", () => {
    const drafts = collapseBySystem([draft({ title: "Revize plynu", legal_basis: "b1" })]);
    const seen = buildSeenKeys([existing({ title: "Revize plynu", legal_basis: "b1" })], []);
    const toInsert = drafts.filter((d) => !seen.has(reminderKey(d.title, d.legal_basis)));
    expect(toInsert).toEqual([]);
  });
});

describe("suggestDueDate — today + interval_months, local calendar day", () => {
  const fixed = new Date(2026, 0, 15); // 2026-01-15 (local)

  it("returns null for null / zero / negative intervals", () => {
    expect(suggestDueDate(null, fixed)).toBeNull();
    expect(suggestDueDate(0, fixed)).toBeNull();
    expect(suggestDueDate(-3, fixed)).toBeNull();
  });

  it("adds whole months and zero-pads month/day", () => {
    expect(suggestDueDate(12, fixed)).toBe("2027-01-15");
    expect(suggestDueDate(1, fixed)).toBe("2026-02-15");
  });

  it("rolls into the next year when months overflow", () => {
    expect(suggestDueDate(36, new Date(2026, 10, 5))).toBe("2029-11-05"); // 2026-11 + 36m
  });

  it("does not mutate the passed-in date", () => {
    const d = new Date(2026, 0, 15);
    suggestDueDate(12, d);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
  });
});
