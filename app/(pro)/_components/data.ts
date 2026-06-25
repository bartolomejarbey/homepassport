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
