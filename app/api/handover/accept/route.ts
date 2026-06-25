// POST /api/handover/accept — kupující převezme pas nemovitosti do své domácnosti.
// Token je nositelem oprávnění: pozvánku ani nemovitost ještě nevidí přes RLS
// (can_access_property je false, dokud neexistuje property_owners vazba), proto
// čteme a zapisujeme service-role klientem (admin) — stejný "chicken-and-egg"
// vzorec jako při zakládání nemovitosti.
//
// Krok po kroku: ověř přihlášení -> validuj token (existuje, pending, neexpiroval)
// -> najdi domácnost kupujícího -> propoj property_owners -> nastav pozvánku
// 'accepted' a nemovitost 'active' -> zapiš audit_event. Přenáší se POUZE
// nemovitost (přenosná vrstva), nikdy soukromá data původního majitele.
//
// Přijímá JSON (fetch -> vrací JSON) i form-encoded (progressive enhancement ze
// stránky /prevzit/[token] -> přesměrovává na detail nebo zpět s ?error=).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ token: z.string().trim().min(1).max(128) });

// Mapování interních chyb na krátké kódy pro ?error= při form POST.
type ErrCode = "expired" | "taken" | "nohousehold" | "failed";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const contentType = request.headers.get("content-type") ?? "";
  const wantsRedirect = contentType.includes("application/x-www-form-urlencoded");

  // Načti token z form-data nebo JSON podle content-type.
  let rawToken: unknown;
  try {
    if (wantsRedirect) {
      const form = await request.formData();
      rawToken = form.get("token");
    } else {
      rawToken = (await request.json())?.token;
    }
  } catch {
    rawToken = undefined;
  }

  const parsed = Body.safeParse({ token: rawToken });
  if (!parsed.success) {
    return wantsRedirect
      ? NextResponse.redirect(`${origin}/`, 303)
      : NextResponse.json({ error: "Neplatný vstup" }, { status: 400 });
  }
  const token = parsed.data.token;
  const here = `${origin}/prevzit/${encodeURIComponent(token)}`;

  // Jednotné odpovědi: form POST přesměruje, fetch dostane JSON.
  const fail = (code: ErrCode, message: string, status: number) =>
    wantsRedirect
      ? NextResponse.redirect(`${here}?error=${code}`, 303)
      : NextResponse.json({ error: message }, { status });
  const succeed = (propertyId: string, extra?: Record<string, unknown>) =>
    wantsRedirect
      ? NextResponse.redirect(`${origin}/nemovitost/${propertyId}`, 303)
      : NextResponse.json({ ok: true, propertyId, ...extra });

  // 1) Musí být přihlášený uživatel (RLS-respecting klient kvůli auth.uid()).
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    // Nepřihlášený přes form: pošli ho na registraci s návratem zpět na stránku.
    return wantsRedirect
      ? NextResponse.redirect(
          `${origin}/registrace?next=${encodeURIComponent(`/prevzit/${token}`)}`,
          303,
        )
      : NextResponse.json({ error: "Neautorizováno" }, { status: 401 });
  }

  // 2) Token čteme adminem — kupující k pozvánce nemá RLS přístup.
  const admin = createAdminClient();
  const { data: invitation, error: invErr } = await admin
    .from("handover_invitations")
    .select("id, property_id, status, expires_at, accepted_by")
    .eq("token", token)
    .maybeSingle();

  if (invErr) return fail("failed", "Pozvánku se nepodařilo načíst", 500);
  if (!invitation) return fail("failed", "Pozvánka neexistuje", 404);

  // 3) Validace stavu pozvánky.
  if (invitation.status === "accepted") {
    // Idempotence: pokud ji převzal tentýž uživatel, ber to jako úspěch.
    if (invitation.accepted_by === user.id) {
      return succeed(invitation.property_id, { alreadyAccepted: true });
    }
    return fail("taken", "Tato pozvánka už byla uplatněna.", 409);
  }
  if (invitation.status === "revoked") {
    return fail("failed", "Pozvánka byla zrušena.", 410);
  }
  if (invitation.status !== "pending") {
    return fail("failed", "Pozvánka už není platná.", 410);
  }
  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
    // Zaznamenej expiraci, ať se stav zhmotní i v DB.
    await admin
      .from("handover_invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id)
      .eq("status", "pending");
    return fail("expired", "Platnost pozvánky vypršela.", 410);
  }

  // 4) Domácnost kupujícího (založená triggerem handle_new_user při registraci).
  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const householdId = membership?.household_id ?? null;
  if (!householdId) {
    return fail("nohousehold", "Nemáte založenou domácnost. Obnovte prosím stránku.", 409);
  }

  // 5) Propoj nemovitost s domácností kupujícího (přenosná vrstva přechází).
  //    onConflict: kdyby vazba náhodou existovala, převzetí proběhne idempotentně.
  const { error: linkErr } = await admin
    .from("property_owners")
    .upsert(
      { property_id: invitation.property_id, household_id: householdId },
      { onConflict: "property_id,household_id", ignoreDuplicates: true },
    );
  if (linkErr) {
    return fail("failed", "Nemovitost se nepodařilo přiřadit k vaší domácnosti.", 500);
  }

  // 6) Pozvánka -> accepted (atomicky jen z 'pending', ochrana proti souběhu).
  const { data: claimed, error: claimErr } = await admin
    .from("handover_invitations")
    .update({
      status: "accepted",
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (claimErr) return fail("failed", "Převzetí se nepodařilo dokončit.", 500);
  if (!claimed) {
    // Někdo jiný stihl pozvánku uplatnit mezi naším čtením a zápisem.
    return fail("taken", "Tato pozvánka už byla uplatněna.", 409);
  }

  // 7) Nemovitost -> active (z draft / transferred po předchozím prodeji).
  await admin
    .from("properties")
    .update({ status: "active" })
    .eq("id", invitation.property_id);

  // 8) Audit: kdo, kdy, co převzal.
  await admin.from("audit_events").insert({
    actor_id: user.id,
    household_id: householdId,
    property_id: invitation.property_id,
    action: "handover.accepted",
    target: { invitation_id: invitation.id },
  });

  return succeed(invitation.property_id);
}
