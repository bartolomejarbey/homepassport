// Server-side data loaders for the B2B console. Plain async helpers (not server
// actions) shared by /pro and /pro/nemovitosti. RLS scopes every read to orgs the
// signed-in user belongs to.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProProperty } from "./propertyMeta";

export type Org = { id: string; name: string; role: string };

/** The orgs the current user is a member of (with their role). */
export async function getMyOrgs(): Promise<Org[]> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return [];

  const { data } = await sb
    .from("organization_members")
    .select("role, organizations(id, name)")
    .eq("user_id", user.id);

  return (data ?? [])
    .map((row: { role: string; organizations: { id: string; name: string } | { id: string; name: string }[] | null }) => {
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      return org ? { id: org.id, name: org.name, role: row.role } : null;
    })
    .filter((o): o is Org => o !== null);
}

/** Property passports created by / linked to the given org (newest first). */
export async function getOrgProperties(orgId: string): Promise<ProProperty[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("property_org_links")
    .select(
      "properties(id, type, title, street, city, postal_code, status, created_at)",
    )
    .eq("organization_id", orgId);

  const seen = new Set<string>();
  return (data ?? [])
    .flatMap((row: { properties: ProProperty | ProProperty[] | null }) =>
      Array.isArray(row.properties) ? row.properties : row.properties ? [row.properties] : [],
    )
    .filter((p) => {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    // Ordering on an embedded resource isn't reliable through the join table, so
    // we sort here — the dashboard's "Poslední pasy" (slice 0..5) depends on it.
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

/**
 * Handover stats for the org's properties, by property_id.
 * "handed over" is measured by an *accepted* invitation — NOT property.status.
 * (On accept we set the property to 'active' because the buyer now owns it, so
 * status would never read 'transferred'. The accepted invitation is the honest
 * signal that a passport reached a buyer.) RLS handover_access lets org members
 * read invitations for properties they can access.
 */
export type HandoverStats = {
  /** property_ids with at least one accepted handover. */
  handedOver: Set<string>;
  /** property_ids with a live (pending, not expired) invitation waiting on a buyer. */
  pending: Set<string>;
};

export async function getOrgHandoverStats(propertyIds: string[]): Promise<HandoverStats> {
  const handedOver = new Set<string>();
  const pending = new Set<string>();
  if (propertyIds.length === 0) return { handedOver, pending };

  const sb = await createClient();
  const { data } = await sb
    .from("handover_invitations")
    .select("property_id, status, expires_at")
    .in("property_id", propertyIds);

  type InviteRow = {
    property_id: string | null;
    status: string;
    expires_at: string | null;
  };
  const rows = (data ?? []) as InviteRow[];

  const now = Date.now();
  for (const row of rows) {
    if (!row.property_id) continue;
    if (row.status === "accepted") {
      handedOver.add(row.property_id);
    } else if (
      row.status === "pending" &&
      (!row.expires_at || new Date(row.expires_at).getTime() >= now)
    ) {
      pending.add(row.property_id);
    }
  }
  return { handedOver, pending };
}

/**
 * A single org-owned property passport, but ONLY if the signed-in user may access
 * it. RLS (can_access_property → property_org_links → is_org_member) returns null
 * for properties the user has no claim to, so this doubles as the access check the
 * /pro/nemovitosti/[id] page relies on. Returns null when not found / not allowed.
 */
export async function getOrgProperty(propertyId: string): Promise<ProProperty | null> {
  const sb = await createClient();
  const { data } = await sb
    .from("properties")
    .select("id, type, title, street, city, postal_code, status, created_at")
    .eq("id", propertyId)
    .maybeSingle();
  return (data as ProProperty | null) ?? null;
}

/**
 * Handover state for a single property in ONE query (the detail page needs both
 * flags; two separate helpers meant two identical round-trips to
 * handover_invitations). `handedOver` wins over `hasPendingInvite` — once a buyer
 * accepted, any leftover pending invite is moot and the UI must hide the dialog.
 */
export type PropertyHandoverState = { handedOver: boolean; hasPendingInvite: boolean };

export async function getPropertyHandoverState(
  propertyId: string,
): Promise<PropertyHandoverState> {
  const { pending, handedOver } = await getOrgHandoverStats([propertyId]);
  const isHandedOver = handedOver.has(propertyId);
  return {
    handedOver: isHandedOver,
    hasPendingInvite: pending.has(propertyId) && !isHandedOver,
  };
}

export type PassportDoc = {
  id: string;
  title: string | null;
  category: string;
  transferable: boolean;
  created_at: string;
  extraction: { status: "draft" | "confirmed" | "rejected"; confidence: number | null } | null;
};

/**
 * Documents attached to an org property passport. These carry household_id = null
 * and property_id = the passport; docs_access RLS exposes them to org members via
 * can_access_property. Newest first; the latest AI draft drives the per-row badge.
 */
export async function getPassportDocuments(propertyId: string): Promise<PassportDoc[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("documents")
    .select(
      "id, title, category, transferable, created_at, document_extractions(status, confidence, created_at)",
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  type Raw = {
    id: string;
    title: string | null;
    category: string;
    transferable: boolean;
    created_at: string;
    document_extractions:
      | { status: "draft" | "confirmed" | "rejected"; confidence: number | null; created_at: string }[]
      | null;
  };

  return ((data as Raw[] | null) ?? []).map((d) => {
    const latest = (d.document_extractions ?? [])
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      transferable: d.transferable,
      created_at: d.created_at,
      extraction: latest ? { status: latest.status, confidence: latest.confidence } : null,
    };
  });
}
