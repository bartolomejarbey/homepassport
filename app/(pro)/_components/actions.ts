// Server actions for the B2B (pro) console: found an organization and create
// builder-owned property passports. Data entry is intentionally minimal — the
// real value is "nahrajte dokumenty, AI je roztřídí", so we ask for as little as
// possible and link the developer straight to document upload afterwards.
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocument } from "@/lib/ai";
import {
  orgSchema,
  orgPropertySchema as propertySchema,
  orgUploadSchema as uploadSchema,
  extractionReviewSchema as reviewSchema,
  DOC_CATEGORIES,
} from "@/lib/validation/schemas";

// ---------- create organization (via bootstrap RPC) ----------
export type CreateOrgResult = { ok: false; error: string } | { ok: true; id: string };

export async function createOrganization(input: unknown): Promise<CreateOrgResult> {
  const parsed = orgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Zkontrolujte název firmy." };
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  // create_organization() is SECURITY DEFINER: it inserts the org AND the
  // owner membership atomically, sidestepping the RLS chicken-and-egg.
  const { data: orgId, error } = await sb.rpc("create_organization", {
    p_name: parsed.data.name,
  });

  if (error || !orgId) {
    return { ok: false, error: "Firmu se nepodařilo založit. Zkuste to prosím znovu." };
  }

  // audit_events má jen SELECT policy (RLS); zápis proto vede přes service role.
  await createAdminClient().from("audit_events").insert({
    actor_id: user.id,
    organization_id: orgId as string,
    action: "organization.created",
    target: { name: parsed.data.name },
  });

  revalidatePath("/pro");
  return { ok: true, id: orgId as string };
}

// ---------- create a builder-owned property passport ----------
export type CreatePropertyResult = { ok: false; error: string } | { ok: true; id: string };

export async function createOrgProperty(input: unknown): Promise<CreatePropertyResult> {
  const parsed = propertySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Zkontrolujte prosím vyplněné údaje." };
  }
  const { organization_id, type, ...addr } = parsed.data;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  // Verify the caller really belongs to this org before we touch the DB with the
  // service role. RLS on organization_members already scopes this read.
  const { data: membership } = await sb
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "Nemáte oprávnění zakládat pasy pro tuto firmu." };
  }

  const clean = (v?: string) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };

  // Chicken-and-egg: properties RLS requires either an owner household or an org
  // link, neither of which can exist before the row. Create the property + the
  // 'builder' org link atomically with the service role; reads then flow through
  // RLS (can_access_property covers org members via property_org_links).
  const admin = createAdminClient();

  const { data: property, error: insertError } = await admin
    .from("properties")
    .insert({
      type,
      title: clean(addr.title),
      street: clean(addr.street),
      city: clean(addr.city),
      postal_code: clean(addr.postal_code),
      status: "draft",
      created_by_org_id: organization_id,
    })
    .select("id")
    .single();

  if (insertError || !property) {
    return { ok: false, error: "Pas nemovitosti se nepodařilo založit. Zkuste to prosím znovu." };
  }

  const { error: linkError } = await admin
    .from("property_org_links")
    .insert({ property_id: property.id, organization_id, relation: "builder" });

  if (linkError) {
    // Roll back so we never leak an org-less, inaccessible property row.
    await admin.from("properties").delete().eq("id", property.id);
    return { ok: false, error: "Pas se nepodařilo přiřadit k firmě." };
  }

  // Seed an empty context row so the revize questionnaire has a stable target.
  await admin.from("property_contexts").insert({ property_id: property.id });

  await admin.from("audit_events").insert({
    actor_id: user.id,
    organization_id,
    property_id: property.id,
    action: "property.created_by_builder",
    target: { type },
  });

  revalidatePath("/pro");
  revalidatePath("/pro/nemovitosti");
  return { ok: true, id: property.id };
}

// ---------- upload a document onto an org property passport ----------
// B2B documents live on the PROPERTY layer (household_id = null), so docs_access
// RLS exposes them to org members via can_access_property and they travel to the
// buyer on handover. Crucially, Storage RLS (storage_household_ok) requires the
// first path segment to be a household the user belongs to — an org property has
// none — so the upload itself MUST go through the service role after we verify the
// caller's org access. We key the path by property_id and never expose it raw.
// DOC_CATEGORIES + orgUploadSchema live in lib/validation/schemas.ts. The base64
// payload (data URL stripped client-side) keeps the action self-contained — no
// separate signed-upload round-trip that storage RLS would block for orgs.

export type UploadDocResult =
  | { ok: false; error: string }
  | { ok: true; id: string; extracted: boolean };

export async function uploadOrgDocument(input: unknown): Promise<UploadDocResult> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Soubor se nepodařilo zpracovat. Zkontrolujte typ a velikost." };
  }
  const { property_id, category, filename, mime, size_bytes, data_base64 } = parsed.data;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  // Access check via RLS: the org link is only readable to org members, so a hit
  // here proves the caller may upload to this property's passport. A passport can
  // carry more than one org link (builder + manager), so take the first match
  // rather than maybeSingle(), which would error on multiple rows.
  const { data: links } = await sb
    .from("property_org_links")
    .select("property_id, organization_id")
    .eq("property_id", property_id)
    .limit(1);
  const link = (links as { property_id: string; organization_id: string }[] | null)?.[0];
  if (!link) {
    return { ok: false, error: "Nemáte oprávnění nahrávat k tomuto pasu." };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(data_base64, "base64");
  } catch {
    return { ok: false, error: "Soubor se nepodařilo načíst." };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, error: "Soubor je prázdný." };
  }
  // The base64 payload is the real source of truth — a client could understate
  // size_bytes. Enforce the 25 MB cap on the decoded bytes too.
  if (bytes.byteLength > 25 * 1024 * 1024) {
    return { ok: false, error: "Soubor je příliš velký (max 25 MB)." };
  }

  const admin = createAdminClient();
  const safeName = filename.replace(/[^\w.\-]+/g, "_");
  // Org passports have no household; key the private path by property_id. Served
  // only via short-lived signed URLs generated server-side.
  const path = `${property_id}/${crypto.randomUUID()}-${safeName}`;
  const contentType = mime && mime.length ? mime : "application/octet-stream";

  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(path, bytes, { contentType, upsert: false });
  if (upErr) {
    return { ok: false, error: "Nahrání do úložiště selhalo. Zkuste to prosím znovu." };
  }

  const { data: doc, error: insErr } = await admin
    .from("documents")
    .insert({
      household_id: null,
      property_id,
      category,
      title: filename,
      file_path: path,
      mime: mime ?? null,
      size_bytes,
      owner_scope: "property",
      // Builder docs follow the home to the buyer by definition.
      transferable: true,
      uploaded_by: user.id,
    })
    .select("id")
    .single();
  if (insErr || !doc) {
    // Roll the orphaned object back so the bucket never drifts from the table.
    await admin.storage.from("documents").remove([path]);
    return { ok: false, error: "Dokument se nepodařilo uložit." };
  }

  // AI DRAFT (never auto-trusted). We extract here with the service role because
  // /api/ai/extract reads storage under RLS, which would deny an org property doc.
  // Failure is non-fatal — the row exists and extraction can be retried later.
  let extracted = false;
  try {
    const dataUrl = `data:${contentType};base64,${data_base64}`;
    const result = await extractDocument(dataUrl);
    // Only persist a draft when the model actually returned substantive fields.
    // extractDocument falls back to {} on a parse miss, and a confidence-only
    // object carries no data — surfacing either as a "Návrh" to confirm would be a
    // hollow, dishonest prompt. In that case we leave the doc without a draft so
    // the UI shows no badge and extraction can be retried later.
    const hasContent = Object.entries(result).some(
      ([k, v]) => k !== "confidence" && v !== null && v !== undefined && v !== "",
    );
    if (hasContent) {
      const confidence = typeof result.confidence === "number" ? result.confidence : null;
      const { error: exErr } = await admin.from("document_extractions").insert({
        document_id: doc.id,
        extracted: result,
        confidence,
        provider: process.env.AI_PROVIDER ?? "openai",
        model: process.env.AI_MODEL ?? "gpt-5.5",
        status: "draft",
      });
      extracted = !exErr;
    }
  } catch {
    extracted = false;
  }

  await admin.from("audit_events").insert({
    actor_id: user.id,
    organization_id: link.organization_id ?? null,
    property_id,
    action: "document.uploaded_by_builder",
    target: { category, filename },
  });

  revalidatePath(`/pro/nemovitosti/${property_id}`);
  revalidatePath("/pro/nemovitosti");
  revalidatePath("/pro");
  return { ok: true, id: doc.id, extracted };
}

// ---------- confirm / reject an AI extraction draft on an org passport ----------
// HARD RULE: every AI output is a DRAFT the user confirms or rejects — nothing is
// auto-trusted. The consumer app has this on /dokumenty/[id]; the B2B passport had
// the "Návrh" badge but NO way to act on it, so org docs could never reach
// 'confirmed'. That broke the handover: /prevzit surfaces only CONFIRMED extractions
// as "Klíčová data", so a builder-uploaded PENB/revize never showed key dates to the
// buyer. These two actions close that loop.
//
// We use the RLS-respecting client (NOT the service role): extractions_access +
// docs_access already let an org member update a draft on a property they can reach
// (can_access_property → property_org_links → is_org_member). No household is
// involved, so — unlike the consumer flow — we deliberately create NO reminders:
// reminders live on the household layer and the buyer receives contextual revize
// only AFTER handover (the honest behaviour; we never invent "další revize do …").
const DOC_CATEGORY_ALIASES: Record<string, (typeof DOC_CATEGORIES)[number]> = {
  smlouva: "contract",
  faktura: "invoice",
  "revizní zpráva": "inspection",
  revize: "inspection",
  záruka: "warranty",
  návod: "manual",
  pojištění: "insurance",
  plán: "plan",
  výkres: "plan",
};

function normalizeDocCategory(raw: unknown): (typeof DOC_CATEGORIES)[number] | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if ((DOC_CATEGORIES as readonly string[]).includes(v)) {
    return v as (typeof DOC_CATEGORIES)[number];
  }
  return DOC_CATEGORY_ALIASES[v] ?? null;
}

// extractionReviewSchema (imported as reviewSchema) lives in lib/validation/schemas.ts.
// property_id is only used to scope revalidation; the source of truth for access is
// the extraction's own document (read back under RLS), never this input.

export type ReviewResult = { ok: false; error: string } | { ok: true };

export async function rejectPassportExtraction(input: unknown): Promise<ReviewResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neplatný požadavek." };

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  // RLS (extractions_access) permits the update only on an extraction whose document
  // the caller can access — i.e. an org passport they belong to.
  const { error } = await sb
    .from("document_extractions")
    .update({ status: "rejected", reviewed_by: user.id })
    .eq("id", parsed.data.extraction_id);
  if (error) return { ok: false, error: "Návrh se nepodařilo odmítnout." };

  revalidatePath(`/pro/nemovitosti/${parsed.data.property_id}`);
  return { ok: true };
}

export async function confirmPassportExtraction(input: unknown): Promise<ReviewResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Neplatný požadavek." };

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  // Source of truth is the extraction itself (its document_id), read back under RLS —
  // not a client-supplied document id. A miss here means no access or no such row.
  const { data: ext } = await sb
    .from("document_extractions")
    .select("id, extracted, document_id, status")
    .eq("id", parsed.data.extraction_id)
    .maybeSingle();
  if (!ext) return { ok: false, error: "Návrh nenalezen nebo k němu nemáte přístup." };

  // Confirm only a fresh draft. If it was already confirmed (double submit) or
  // superseded by a newer extraction (rejected), do nothing — never revive stale data.
  if (ext.status !== "draft") {
    revalidatePath(`/pro/nemovitosti/${parsed.data.property_id}`);
    return { ok: true };
  }

  const { error: updErr } = await sb
    .from("document_extractions")
    .update({ status: "confirmed", reviewed_by: user.id })
    .eq("id", parsed.data.extraction_id)
    .eq("status", "draft"); // race guard: confirm only if still a draft
  if (updErr) return { ok: false, error: "Návrh se nepodařilo potvrdit." };

  // Confirmed data becomes source of truth: backfill the document category only when
  // it is still the generic "other" — never overwrite what the firm chose on upload.
  const data = (ext.extracted ?? {}) as { category?: string };
  const suggested = normalizeDocCategory(data.category);
  if (suggested) {
    const { data: doc } = await sb
      .from("documents")
      .select("id, category")
      .eq("id", ext.document_id as string)
      .maybeSingle();
    if (doc && doc.category === "other") {
      await sb.from("documents").update({ category: suggested }).eq("id", doc.id);
    }
  }

  revalidatePath(`/pro/nemovitosti/${parsed.data.property_id}`);
  revalidatePath("/pro/nemovitosti");
  return { ok: true };
}
