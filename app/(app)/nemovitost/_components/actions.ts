// Server actions for the property slice: create a property + owner link, update context.
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------- create property ----------
const propertySchema = z.object({
  type: z.enum(["house", "apartment", "unit", "land", "commercial"]),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  street: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
});

export type CreatePropertyResult = { ok: false; error: string } | { ok: true; id: string };

export async function createProperty(input: unknown): Promise<CreatePropertyResult> {
  const parsed = propertySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Zkontrolujte prosím vyplněné údaje." };
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  // Find (or fail gracefully on) the user's household.
  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const householdId = membership?.household_id ?? null;
  if (!householdId) {
    return { ok: false, error: "Nemáte založenou domácnost. Obnovte prosím stránku." };
  }

  // Chicken-and-egg: properties RLS requires an existing owner link, which cannot
  // exist before the row does. We create the property + owner link atomically with
  // the service role, then everything else flows through RLS-respecting clients.
  const admin = createAdminClient();

  const clean = (v?: string) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };

  const { data: property, error: insertError } = await admin
    .from("properties")
    .insert({
      type: parsed.data.type,
      title: clean(parsed.data.title),
      street: clean(parsed.data.street),
      city: clean(parsed.data.city),
      postal_code: clean(parsed.data.postal_code),
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !property) {
    return { ok: false, error: "Nemovitost se nepodařilo založit. Zkuste to prosím znovu." };
  }

  const { error: linkError } = await admin
    .from("property_owners")
    .insert({ property_id: property.id, household_id: householdId });

  if (linkError) {
    // Roll back the orphaned property so we don't leak an inaccessible row.
    await admin.from("properties").delete().eq("id", property.id);
    return { ok: false, error: "Nemovitost se nepodařilo přiřadit k domácnosti." };
  }

  // Seed a context row so the questionnaire has a stable upsert target.
  // IMPORTANT: usage flags must start all-false. The column default for
  // owner_occupied is `true`, which would make a never-filled context read as
  // "done" on the detail page and hide the "Doplňte kontext" nudge. We seed an
  // explicitly empty usage so the nudge shows until the user actually answers.
  // has_electrical stays true (most homes have it) to match the questionnaire's
  // sensible default.
  await admin.from("property_contexts").insert({
    property_id: property.id,
    owner_occupied: false,
    rental: false,
    svj: false,
    business_use: false,
    has_electrical: true,
  });

  await admin.from("audit_events").insert({
    actor_id: user.id,
    household_id: householdId,
    property_id: property.id,
    action: "property.created",
    target: { type: parsed.data.type },
  });

  revalidatePath("/nemovitost");
  return { ok: true, id: property.id };
}

// ---------- update context (questionnaire) ----------
const contextSchema = z
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

export type UpdateContextResult = { ok: false; error: string } | { ok: true };

export async function updatePropertyContext(input: unknown): Promise<UpdateContextResult> {
  const parsed = contextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Zkontrolujte prosím vyplněné údaje." };
  }
  const { property_id, ...ctx } = parsed.data;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  // RLS (propctx_access / can_access_property) gates this to owners only.
  const { error } = await sb
    .from("property_contexts")
    .upsert(
      {
        property_id,
        ...ctx,
        // keep fuel only when a chimney is present
        chimney_fuel: ctx.has_chimney ? ctx.chimney_fuel : null,
      },
      { onConflict: "property_id" },
    );

  if (error) {
    return { ok: false, error: "Kontext se nepodařilo uložit. Zkuste to prosím znovu." };
  }

  // audit_events má jen SELECT policy (RLS); zápis proto vede přes service role.
  await createAdminClient().from("audit_events").insert({
    actor_id: user.id,
    property_id,
    action: "property.context_updated",
    target: null,
  });

  revalidatePath(`/nemovitost/${property_id}`);
  revalidatePath(`/nemovitost/${property_id}/kontext`);
  return { ok: true };
}

// ---------- update property identity (title / type / address / cadastre / status) ----------
// The passport's own identity fields stay editable after founding — at creation we
// only collect the essentials, and cadastral_id isn't captured there at all even
// though the detail header shows it. This action backs the inline "Upravit údaje"
// form on the detail page so the passport is a living record, not a one-shot insert.
const updateSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["house", "apartment", "unit", "land", "commercial"]),
    title: z.string().trim().max(120).optional().or(z.literal("")),
    street: z.string().trim().max(160).optional().or(z.literal("")),
    city: z.string().trim().max(120).optional().or(z.literal("")),
    postal_code: z.string().trim().max(20).optional().or(z.literal("")),
    cadastral_id: z.string().trim().max(40).optional().or(z.literal("")),
    // 'transferred' is system-driven by a completed handover, never set by hand,
    // so we deliberately exclude it from manual control to keep status honest.
    status: z.enum(["draft", "active", "archived"]),
  })
  .strict();

export type UpdatePropertyResult = { ok: false; error: string } | { ok: true };

export async function updateProperty(input: unknown): Promise<UpdatePropertyResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Zkontrolujte prosím vyplněné údaje." };
  }
  const { id, ...fields } = parsed.data;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Nejste přihlášeni." };

  const clean = (v?: string) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };

  // RLS (prop_access / can_access_property) gates the update to owners (and linked
  // orgs) only — the owner link already exists by now, so the RLS-respecting client
  // is enough; no service role needed.
  const { data: updated, error } = await sb
    .from("properties")
    .update({
      type: fields.type,
      title: clean(fields.title),
      street: clean(fields.street),
      city: clean(fields.city),
      postal_code: clean(fields.postal_code),
      cadastral_id: clean(fields.cadastral_id),
      status: fields.status,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, error: "Změny se nepodařilo uložit. Zkuste to prosím znovu." };
  }

  // Household scope for the audit trail (a property may be co-owned; first link is fine).
  const { data: ownerLink } = await sb
    .from("property_owners")
    .select("household_id")
    .eq("property_id", id)
    .limit(1)
    .maybeSingle();

  // audit_events má jen SELECT policy (RLS); zápis proto vede přes service role.
  await createAdminClient().from("audit_events").insert({
    actor_id: user.id,
    household_id: ownerLink?.household_id ?? null,
    property_id: id,
    action: "property.updated",
    target: { status: fields.status, type: fields.type },
  });

  revalidatePath("/nemovitost");
  revalidatePath(`/nemovitost/${id}`);
  return { ok: true };
}
