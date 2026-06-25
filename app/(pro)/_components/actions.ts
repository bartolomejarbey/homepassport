// Server actions for the B2B (pro) console: found an organization and create
// builder-owned property passports. Data entry is intentionally minimal — the
// real value is "nahrajte dokumenty, AI je roztřídí", so we ask for as little as
// possible and link the developer straight to document upload afterwards.
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------- create organization (via bootstrap RPC) ----------
const orgSchema = z.object({
  name: z.string().trim().min(2, "Zadejte název firmy.").max(160),
});

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

  await sb.from("audit_events").insert({
    actor_id: user.id,
    organization_id: orgId as string,
    action: "organization.created",
    target: { name: parsed.data.name },
  });

  revalidatePath("/pro");
  return { ok: true, id: orgId as string };
}

// ---------- create a builder-owned property passport ----------
const propertySchema = z.object({
  organization_id: z.string().uuid(),
  type: z.enum(["house", "apartment", "unit", "land", "commercial"]),
  title: z.string().trim().max(160).optional().or(z.literal("")),
  street: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
});

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

// Convenience: create a passport then bounce straight to its document upload so
// the developer can start dropping files immediately (AI does the sorting).
export async function createOrgPropertyAndUpload(input: unknown) {
  const res = await createOrgProperty(input);
  if (res.ok) redirect(`/dokumenty?property=${res.id}`);
  return res;
}
