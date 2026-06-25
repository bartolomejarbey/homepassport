// Server actions for the property slice: create a property + owner link, update context.
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  // Seed an empty context row so the questionnaire has a stable target.
  await admin.from("property_contexts").insert({ property_id: property.id });

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

  await sb.from("audit_events").insert({
    actor_id: user.id,
    property_id,
    action: "property.context_updated",
    target: null,
  });

  revalidatePath(`/nemovitost/${property_id}`);
  revalidatePath(`/nemovitost/${property_id}/kontext`);
  return { ok: true };
}

// Convenience server action used by the create dialog: create then redirect to detail.
export async function createPropertyAndRedirect(input: unknown) {
  const res = await createProperty(input);
  if (res.ok) redirect(`/nemovitost/${res.id}`);
  return res;
}
