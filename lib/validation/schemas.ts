// Canonical Zod input schemas for the server actions and API routes.
//
// These were previously declared inline in each action/route file. They are
// gathered here — a pure, side-effect-free module (no `server-only`, no next/*) —
// so the validation contract can be unit-tested directly and shared without the
// same enum/address shape drifting across files. Behaviour is unchanged: each
// schema below is the exact definition its caller used.
//
// SECURITY NOTE: the two .strict() schemas (propertyContext, propertyUpdate)
// reject unknown keys on purpose — a client must not smuggle extra columns (e.g.
// a status the UI never offers) into an upsert/update that RLS would still let
// through for the row's owner. Keep them strict.
import { z } from "zod";

// ---- shared building blocks ----
export const PROPERTY_TYPES = ["house", "apartment", "unit", "land", "commercial"] as const;
export const propertyTypeSchema = z.enum(PROPERTY_TYPES);

// An optional free-text field that also accepts an explicit empty string (the
// form submits "" for untouched inputs). Length-bounded per field below.
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const DOC_CATEGORIES = [
  "contract", "invoice", "penb", "inspection",
  "manual", "warranty", "plan", "insurance", "other",
] as const;

// ---- nemovitost (consumer) server actions ----
export const propertyCreateSchema = z.object({
  type: propertyTypeSchema,
  title: optText(120),
  street: optText(160),
  city: optText(120),
  postal_code: optText(20),
});

// .strict(): the questionnaire writes the full context; no stray keys allowed.
export const propertyContextSchema = z
  .object({
    property_id: z.string().uuid(),
    owner_occupied: z.boolean(),
    rental: z.boolean(),
    svj: z.boolean(),
    business_use: z.boolean(),
    has_chimney: z.boolean(),
    chimney_fuel: z.enum(["solid", "liquid", "gas"]).nullable(),
    has_gas: z.boolean(),
    has_electrical: z.boolean(),
    has_lps: z.boolean(),
    has_pv: z.boolean(),
  })
  .strict();

// .strict(): 'transferred'/'transferable' and any other column are system-driven
// and must never be settable by hand through this form.
export const propertyUpdateSchema = z
  .object({
    id: z.string().uuid(),
    type: propertyTypeSchema,
    title: optText(120),
    street: optText(160),
    city: optText(120),
    postal_code: optText(20),
    cadastral_id: optText(40),
    status: z.enum(["draft", "active", "archived"]),
  })
  .strict();

// ---- (pro) B2B console server actions ----
export const orgSchema = z.object({
  name: z.string().trim().min(2, "Zadejte název firmy.").max(160),
});

export const orgPropertySchema = z.object({
  organization_id: z.string().uuid(),
  type: propertyTypeSchema,
  title: optText(160),
  street: optText(160),
  city: optText(120),
  postal_code: optText(20),
});

export const orgUploadSchema = z.object({
  property_id: z.string().uuid(),
  category: z.enum(DOC_CATEGORIES),
  filename: z.string().trim().min(1).max(200),
  mime: z.string().trim().max(120).optional(),
  size_bytes: z.number().int().nonnegative().max(25 * 1024 * 1024),
  data_base64: z.string().min(1),
});

export const extractionReviewSchema = z.object({
  extraction_id: z.string().uuid(),
  property_id: z.string().uuid(),
});

// ---- reminders (pripominky) server actions ----
export const reminderIdSchema = z.string().uuid();
export const snoozeDaysSchema = z.coerce.number().int().min(1).max(365);

// ---- API route bodies ----
export const revizeGenerateBody = z.object({ propertyId: z.string().uuid() });
export const handoverInviteBody = z.object({
  propertyId: z.string().uuid(),
  buyerEmail: z.string().trim().email("Neplatný e-mail kupujícího."),
});
export const handoverAcceptBody = z.object({ token: z.string().trim().min(1).max(128) });
export const aiValueBody = z.object({ assetId: z.string().uuid() });
export const aiExtractBody = z.object({ documentId: z.string().uuid() });
export const aiSearchBody = z.object({ query: z.string().trim().min(2).max(500) });
export const aiRecognizeBody = z.object({ path: z.string().min(1).max(400) });
