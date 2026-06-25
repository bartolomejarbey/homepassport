// Server-side data loaders for the B2B console. Plain async helpers (not server
// actions) shared by /pro and /pro/nemovitosti. RLS scopes every read to orgs the
// signed-in user belongs to.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

export type PassportExtraction = {
  id: string;
  status: "draft" | "confirmed" | "rejected";
  confidence: number | null;
  /** Short, human-readable gist of the proposed fields (for the "Návrh" preview). */
  summary: string | null;
};

export type PassportDoc = {
  id: string;
  title: string | null;
  category: string;
  transferable: boolean;
  created_at: string;
  /** Latest extraction (drives badge + confirm/reject buttons). */
  extraction: PassportExtraction | null;
  /** Short-lived signed link to the SOURCE file (the draft's provenance). */
  sourceUrl: string | null;
};

// numeric -> PostgREST returns it as a string; normalise for display/compare.
function toNum(c: number | string | null | undefined): number | null {
  if (c == null) return null;
  const n = typeof c === "number" ? c : Number(c);
  return Number.isFinite(n) ? n : null;
}

// One honest line summarising what the model proposed — only fields it actually
// returned, never invented. Drives the "Návrh" preview so confirm/reject is informed.
function summariseExtraction(ex: Record<string, unknown> | null): string | null {
  if (!ex) return null;
  const parts: string[] = [];
  const push = (label: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(`${label}: ${v.trim()}`);
    else if (typeof v === "number" && Number.isFinite(v)) parts.push(`${label}: ${v}`);
  };
  push("Dodavatel", ex.supplier);
  push("Datum", ex.date);
  push("Záruka do", ex.warranty_until);
  push("Č. revize", ex.inspection_no);
  if (typeof ex.amount === "number" && Number.isFinite(ex.amount)) {
    const cur = typeof ex.currency === "string" && ex.currency.trim() ? ` ${ex.currency.trim()}` : "";
    parts.push(`Částka: ${ex.amount}${cur}`);
  }
  if (parts.length === 0 && typeof ex.summary === "string" && ex.summary.trim()) {
    return ex.summary.trim();
  }
  return parts.length ? parts.slice(0, 3).join(" · ") : null;
}

/**
 * Documents attached to an org property passport. These carry household_id = null
 * and property_id = the passport; docs_access RLS exposes them to org members via
 * can_access_property. Newest first; the latest AI draft drives the per-row badge
 * and the confirm/reject controls. Each row also gets a short-lived signed link to
 * its source file (the draft's provenance) — org files live under <property_id>/...
 * which storage RLS can't sign for a household-less org, so we sign with the admin
 * client server-side (TTL 1h), never exposing the raw path. Same reasoning as upload.
 */
export async function getPassportDocuments(propertyId: string): Promise<PassportDoc[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("documents")
    .select(
      "id, title, category, transferable, file_path, created_at, document_extractions(id, status, confidence, extracted, created_at)",
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  type Raw = {
    id: string;
    title: string | null;
    category: string;
    transferable: boolean;
    file_path: string;
    created_at: string;
    document_extractions:
      | {
          id: string;
          status: "draft" | "confirmed" | "rejected";
          confidence: number | string | null;
          extracted: Record<string, unknown> | null;
          created_at: string;
        }[]
      | null;
  };

  const rows = (data as Raw[] | null) ?? [];
  if (rows.length === 0) return [];

  // Batch-sign every source path in one round-trip (admin: org files have no
  // household segment, so the RLS client cannot sign them). Map path -> signed URL.
  const admin = createAdminClient();
  const paths = rows.map((d) => d.file_path).filter(Boolean);
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await admin.storage.from("documents").createSignedUrls(paths, 3600);
    for (const row of signed ?? []) {
      if (row?.path && row.signedUrl) signedByPath.set(row.path, row.signedUrl);
    }
  }

  return rows.map((d) => {
    const latest = (d.document_extractions ?? [])
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      transferable: d.transferable,
      created_at: d.created_at,
      extraction: latest
        ? {
            id: latest.id,
            status: latest.status,
            confidence: toNum(latest.confidence),
            summary: summariseExtraction(latest.extracted),
          }
        : null,
      sourceUrl: signedByPath.get(d.file_path) ?? null,
    };
  });
}
