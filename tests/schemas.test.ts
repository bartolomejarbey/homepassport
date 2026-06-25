import { describe, it, expect } from "vitest";
import {
  propertyCreateSchema,
  propertyContextSchema,
  propertyUpdateSchema,
  orgSchema,
  orgPropertySchema,
  orgUploadSchema,
  extractionReviewSchema,
  reminderIdSchema,
  snoozeDaysSchema,
  revizeGenerateBody,
  handoverInviteBody,
  handoverAcceptBody,
  aiValueBody,
  aiSearchBody,
  aiRecognizeBody,
  PROPERTY_TYPES,
  DOC_CATEGORIES,
} from "@/lib/validation/schemas";

// Contract tests for every Zod input schema behind a server action / API route.
// These are the canonical schemas the actions/routes import (extracted into
// lib/validation/schemas.ts), so a regression here is a regression in real input
// validation. For each schema we assert: a valid payload passes; representative
// invalid payloads fail; and — for the .strict() ones — an unknown extra key is
// REJECTED (the multi-tenant safety property 0004 cares about).

const UUID = "11111111-2222-4333-8444-555555555555";

function ctx(over: Record<string, unknown> = {}) {
  return {
    property_id: UUID,
    owner_occupied: true,
    rental: false,
    svj: false,
    business_use: false,
    has_chimney: false,
    chimney_fuel: null,
    has_gas: false,
    has_electrical: true,
    has_lps: false,
    has_pv: false,
    ...over,
  };
}

describe("propertyContextSchema (.strict())", () => {
  it("accepts a full, valid context", () => {
    expect(propertyContextSchema.safeParse(ctx()).success).toBe(true);
  });

  it("accepts a chimney_fuel enum value when present", () => {
    const r = propertyContextSchema.safeParse(ctx({ has_chimney: true, chimney_fuel: "solid" }));
    expect(r.success).toBe(true);
  });

  it("REJECTS an unknown extra field (strict — no smuggling extra columns)", () => {
    const r = propertyContextSchema.safeParse(ctx({ is_admin: true }));
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid property_id", () => {
    expect(propertyContextSchema.safeParse(ctx({ property_id: "not-a-uuid" })).success).toBe(false);
  });

  it("rejects a missing required boolean", () => {
    const bad = ctx();
    delete (bad as Record<string, unknown>).has_gas;
    expect(propertyContextSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-boolean usage flag", () => {
    expect(propertyContextSchema.safeParse(ctx({ rental: "yes" })).success).toBe(false);
  });

  it("rejects an invalid chimney_fuel value", () => {
    expect(propertyContextSchema.safeParse(ctx({ chimney_fuel: "wood" })).success).toBe(false);
  });

  it("allows chimney_fuel = null (nullable)", () => {
    expect(propertyContextSchema.safeParse(ctx({ chimney_fuel: null })).success).toBe(true);
  });
});

describe("propertyUpdateSchema (.strict())", () => {
  const base = { id: UUID, type: "house", status: "active" };

  it("accepts a minimal valid update", () => {
    expect(propertyUpdateSchema.safeParse(base).success).toBe(true);
  });

  it("accepts optional address + cadastral_id as empty strings", () => {
    const r = propertyUpdateSchema.safeParse({
      ...base, title: "", street: "", city: "", postal_code: "", cadastral_id: "",
    });
    expect(r.success).toBe(true);
  });

  it("REJECTS an unknown extra field (e.g. trying to force 'transferable')", () => {
    expect(propertyUpdateSchema.safeParse({ ...base, transferable: true }).success).toBe(false);
  });

  it("rejects 'transferred' status (system-driven, not in the manual enum)", () => {
    expect(propertyUpdateSchema.safeParse({ ...base, status: "transferred" }).success).toBe(false);
  });

  it("rejects an unknown property type", () => {
    expect(propertyUpdateSchema.safeParse({ ...base, type: "castle" }).success).toBe(false);
  });

  it("rejects an over-long cadastral_id (> 40 chars)", () => {
    expect(propertyUpdateSchema.safeParse({ ...base, cadastral_id: "x".repeat(41) }).success).toBe(false);
  });
});

describe("propertyCreateSchema (non-strict)", () => {
  it("accepts just a type", () => {
    expect(propertyCreateSchema.safeParse({ type: "apartment" }).success).toBe(true);
  });

  it("covers every property type in PROPERTY_TYPES", () => {
    for (const t of PROPERTY_TYPES) {
      expect(propertyCreateSchema.safeParse({ type: t }).success).toBe(true);
    }
  });

  it("rejects a missing type", () => {
    expect(propertyCreateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an over-long title (> 120 chars)", () => {
    expect(propertyCreateSchema.safeParse({ type: "house", title: "x".repeat(121) }).success).toBe(false);
  });

  it("trims whitespace on text fields", () => {
    const r = propertyCreateSchema.safeParse({ type: "house", city: "  Brno  " });
    expect(r.success && r.data.city).toBe("Brno");
  });
});

describe("orgSchema", () => {
  it("accepts a 2+ char name and trims it", () => {
    const r = orgSchema.safeParse({ name: "  Stavby s.r.o.  " });
    expect(r.success && r.data.name).toBe("Stavby s.r.o.");
  });

  it("rejects a name shorter than 2 chars with the Czech message", () => {
    const r = orgSchema.safeParse({ name: "A" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Zadejte název firmy.");
  });

  it("rejects an over-long name (> 160 chars)", () => {
    expect(orgSchema.safeParse({ name: "x".repeat(161) }).success).toBe(false);
  });
});

describe("orgPropertySchema", () => {
  it("accepts a valid org property", () => {
    expect(orgPropertySchema.safeParse({ organization_id: UUID, type: "commercial" }).success).toBe(true);
  });
  it("rejects a missing organization_id", () => {
    expect(orgPropertySchema.safeParse({ type: "house" }).success).toBe(false);
  });
  it("rejects a non-uuid organization_id", () => {
    expect(orgPropertySchema.safeParse({ organization_id: "x", type: "house" }).success).toBe(false);
  });
});

describe("orgUploadSchema", () => {
  const good = {
    property_id: UUID,
    category: "invoice",
    filename: "faktura.pdf",
    size_bytes: 1024,
    data_base64: "QUJD",
  };

  it("accepts a valid upload (mime optional)", () => {
    expect(orgUploadSchema.safeParse(good).success).toBe(true);
  });

  it("accepts every known document category", () => {
    for (const c of DOC_CATEGORIES) {
      expect(orgUploadSchema.safeParse({ ...good, category: c }).success).toBe(true);
    }
  });

  it("rejects an unknown category", () => {
    expect(orgUploadSchema.safeParse({ ...good, category: "selfie" }).success).toBe(false);
  });

  it("rejects an empty filename", () => {
    expect(orgUploadSchema.safeParse({ ...good, filename: "" }).success).toBe(false);
  });

  it("rejects empty base64 payload", () => {
    expect(orgUploadSchema.safeParse({ ...good, data_base64: "" }).success).toBe(false);
  });

  it("rejects a negative size", () => {
    expect(orgUploadSchema.safeParse({ ...good, size_bytes: -1 }).success).toBe(false);
  });

  it("rejects a non-integer size", () => {
    expect(orgUploadSchema.safeParse({ ...good, size_bytes: 10.5 }).success).toBe(false);
  });

  it("rejects a size over the 25 MB cap", () => {
    expect(orgUploadSchema.safeParse({ ...good, size_bytes: 25 * 1024 * 1024 + 1 }).success).toBe(false);
  });

  it("accepts a size exactly at the 25 MB cap (boundary)", () => {
    expect(orgUploadSchema.safeParse({ ...good, size_bytes: 25 * 1024 * 1024 }).success).toBe(true);
  });
});

describe("extractionReviewSchema", () => {
  it("accepts two uuids", () => {
    expect(extractionReviewSchema.safeParse({ extraction_id: UUID, property_id: UUID }).success).toBe(true);
  });
  it("rejects a missing property_id", () => {
    expect(extractionReviewSchema.safeParse({ extraction_id: UUID }).success).toBe(false);
  });
});

describe("reminderIdSchema", () => {
  it("accepts a uuid", () => {
    expect(reminderIdSchema.safeParse(UUID).success).toBe(true);
  });
  it("rejects a non-uuid / null", () => {
    expect(reminderIdSchema.safeParse("nope").success).toBe(false);
    expect(reminderIdSchema.safeParse(null).success).toBe(false);
  });
});

describe("snoozeDaysSchema (z.coerce.number)", () => {
  it("coerces a numeric string into a number in range", () => {
    const r = snoozeDaysSchema.safeParse("30");
    expect(r.success && r.data).toBe(30);
  });
  it("rejects 0 and values over 365", () => {
    expect(snoozeDaysSchema.safeParse("0").success).toBe(false);
    expect(snoozeDaysSchema.safeParse(366).success).toBe(false);
  });
  it("accepts the boundaries 1 and 365", () => {
    expect(snoozeDaysSchema.safeParse(1).success).toBe(true);
    expect(snoozeDaysSchema.safeParse(365).success).toBe(true);
  });
  it("rejects a non-integer and non-numeric input", () => {
    expect(snoozeDaysSchema.safeParse(3.5).success).toBe(false);
    expect(snoozeDaysSchema.safeParse("abc").success).toBe(false);
  });
});

describe("API route bodies", () => {
  it("revizeGenerateBody requires a uuid propertyId", () => {
    expect(revizeGenerateBody.safeParse({ propertyId: UUID }).success).toBe(true);
    expect(revizeGenerateBody.safeParse({ propertyId: "x" }).success).toBe(false);
    expect(revizeGenerateBody.safeParse({}).success).toBe(false);
  });

  it("handoverInviteBody requires a uuid + valid email", () => {
    expect(handoverInviteBody.safeParse({ propertyId: UUID, buyerEmail: "a@b.cz" }).success).toBe(true);
    const bad = handoverInviteBody.safeParse({ propertyId: UUID, buyerEmail: "not-an-email" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0].message).toBe("Neplatný e-mail kupujícího.");
  });

  it("handoverInviteBody trims and lowercases nothing but trims the email", () => {
    const r = handoverInviteBody.safeParse({ propertyId: UUID, buyerEmail: "  a@b.cz  " });
    expect(r.success && r.data.buyerEmail).toBe("a@b.cz");
  });

  it("handoverAcceptBody requires a non-empty token within 128 chars", () => {
    expect(handoverAcceptBody.safeParse({ token: "abc" }).success).toBe(true);
    expect(handoverAcceptBody.safeParse({ token: "" }).success).toBe(false);
    expect(handoverAcceptBody.safeParse({ token: "x".repeat(129) }).success).toBe(false);
  });

  it("aiValueBody requires a uuid assetId", () => {
    expect(aiValueBody.safeParse({ assetId: UUID }).success).toBe(true);
    expect(aiValueBody.safeParse({ assetId: 123 }).success).toBe(false);
  });

  it("aiSearchBody requires a 2..500 char query and trims it", () => {
    expect(aiSearchBody.safeParse({ query: "kdy revize" }).success).toBe(true);
    expect(aiSearchBody.safeParse({ query: "a" }).success).toBe(false);
    expect(aiSearchBody.safeParse({ query: "x".repeat(501) }).success).toBe(false);
    const r = aiSearchBody.safeParse({ query: "  revize  " });
    expect(r.success && r.data.query).toBe("revize");
  });

  it("aiRecognizeBody requires a 1..400 char path", () => {
    expect(aiRecognizeBody.safeParse({ path: "household/abc.jpg" }).success).toBe(true);
    expect(aiRecognizeBody.safeParse({ path: "" }).success).toBe(false);
    expect(aiRecognizeBody.safeParse({ path: "x".repeat(401) }).success).toBe(false);
  });
});
