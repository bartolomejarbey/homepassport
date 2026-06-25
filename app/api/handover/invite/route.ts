// POST /api/handover/invite — vytvoří pozvánku k převzetí nemovitosti (B2B).
// Developer/správce vygeneruje pro daný property_id token, který pošle kupujícímu.
// Kupující jím na /prevzit/[token] převezme přenositelnou vrstvu pasu (dokumenty
// s transferable=true, kontext, revize). Token NEexponuje žádná soukromá data —
// je to jen jednorázový claim. Vrací sdílecí odkaz /prevzit/[token].
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// E-mail kupujícího validujeme i přesto, že RLS hlídá přístup k nemovitosti.
const Body = z.object({
  propertyId: z.string().uuid(),
  buyerEmail: z.string().trim().email("Neplatný e-mail kupujícího."),
});

export async function POST(request: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? (err.issues[0]?.message ?? "Neplatný vstup")
        : "Neplatný vstup";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Ověř, že volající má k nemovitosti přístup (RLS handover_access /
  // can_access_property pokrývá org members přes property_org_links). Read
  // pod RLS slouží jako autorizační brána před zápisem.
  const { data: prop, error: propErr } = await sb
    .from("properties")
    .select("id")
    .eq("id", parsed.propertyId)
    .maybeSingle();

  if (propErr) {
    return NextResponse.json({ error: "Nemovitost se nepodařilo ověřit" }, { status: 500 });
  }
  if (!prop) {
    return NextResponse.json(
      { error: "Nemovitost nenalezena nebo k ní nemáte přístup." },
      { status: 404 },
    );
  }

  // Token generuje DB (default encode(gen_random_bytes(24),'hex')) — nevoláme
  // ho z klienta a nikdy ho nepoužíváme jako autentizaci, jen jako claim.
  const { data: invitation, error: insErr } = await sb
    .from("handover_invitations")
    .insert({
      property_id: parsed.propertyId,
      buyer_email: parsed.buyerEmail,
      status: "pending",
      created_by: user.id,
    })
    .select("id, token, buyer_email, status, expires_at")
    .single();

  if (insErr || !invitation) {
    return NextResponse.json(
      { error: "Pozvánku se nepodařilo vytvořit. Zkuste to prosím znovu." },
      { status: 500 },
    );
  }

  // audit_events má jen SELECT policy (RLS); zápis proto vede přes service role.
  await createAdminClient().from("audit_events").insert({
    actor_id: user.id,
    property_id: parsed.propertyId,
    action: "handover.invited",
    target: { buyer_email: parsed.buyerEmail, invitation_id: invitation.id },
  });

  // Sdílecí odkaz stavíme z hlavičky requestu (funguje na prod i lokálně).
  const origin = new URL(request.url).origin;
  const url = `${origin}/prevzit/${invitation.token}`;

  return NextResponse.json({
    id: invitation.id,
    token: invitation.token,
    buyerEmail: invitation.buyer_email,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    url,
    path: `/prevzit/${invitation.token}`,
  });
}
