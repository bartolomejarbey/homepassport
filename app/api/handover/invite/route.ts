// POST /api/handover/invite — vytvoří pozvánku k převzetí nemovitosti (B2B).
// Developer/správce vygeneruje pro daný property_id token, který pošle kupujícímu.
// Kupující jím na /prevzit/[token] převezme přenositelnou vrstvu pasu (dokumenty
// s transferable=true, kontext, revize). Token NEexponuje žádná soukromá data —
// je to jen jednorázový claim. Vrací sdílecí odkaz /prevzit/[token].
//
// ROBUSTNOST: vstup je limitovaný (Content-Length + zod), každá chybová větev
// vrací čistý JSON {error,code} a celé tělo je obalené poslední záchranou, takže
// neočekávaná chyba nikdy neskončí jako HTML stránka. Žádné AI volání zde není.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicOrigin } from "../origin";
// E-mail kupujícího validujeme i přesto, že RLS hlídá přístup k nemovitosti.
// Schéma (handoverInviteBody) viz lib/validation/schemas.ts.
import { handoverInviteBody as Body } from "@/lib/validation/schemas";
import { jsonError, readJson, rejectIfTooLarge } from "@/lib/util/api";
// Transakční e-mail kupujícímu (best-effort: nikdy nesmí shodit pozvánku).
import { sendHandoverInvitation } from "@/lib/email";

export async function POST(request: Request) {
  try {
    // Tělo je drobný JSON ({propertyId, buyerEmail}) — větší odmítneme předem.
    const tooLarge = rejectIfTooLarge(request);
    if (tooLarge) return tooLarge;

    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return jsonError("Neautorizováno", 401, "unauthorized");
    }

    // safeParse: zachováme konkrétní českou hlášku z první Zod chyby (klient ji
    // ukazuje uživateli), ale bez vyhazování výjimky.
    const parsedInput = Body.safeParse(await readJson(request));
    if (!parsedInput.success) {
      const msg = parsedInput.error.issues[0]?.message ?? "Neplatný vstup";
      return jsonError(msg, 400, "invalid_input");
    }
    const parsed = parsedInput.data;

    // Ověř, že volající má k nemovitosti přístup (RLS handover_access /
    // can_access_property pokrývá org members přes property_org_links). Read
    // pod RLS slouží jako autorizační brána před zápisem.
    const { data: prop, error: propErr } = await sb
      .from("properties")
      .select("id, title")
      .eq("id", parsed.propertyId)
      .maybeSingle();

    if (propErr) {
      return jsonError("Nemovitost se nepodařilo ověřit", 500, "verify_failed");
    }
    if (!prop) {
      return jsonError(
        "Nemovitost nenalezena nebo k ní nemáte přístup.",
        404,
        "not_found",
      );
    }

    // Pas, který už někdo převzal (accepted), nesmí jít vystavit znovu — jinak by
    // šel předat DRUHÉMU kupujícímu a přenosné dokumenty by se vlily i do jeho
    // domácnosti. UI dialog v tomto stavu skrývá, ale API musí tu smlouvu vynutit
    // samo (org link přetrvává i po prodeji, takže can_access_property zůstává
    // true). Čteme přes RLS klienta — org member na pozvánky vidí přes handover_access.
    const { data: acceptedRows, error: acceptedErr } = await sb
      .from("handover_invitations")
      .select("id")
      .eq("property_id", parsed.propertyId)
      .eq("status", "accepted")
      .limit(1);

    if (acceptedErr) {
      return jsonError("Stav předání se nepodařilo ověřit.", 500, "verify_failed");
    }
    if (acceptedRows && acceptedRows.length > 0) {
      return jsonError(
        "Tato nemovitost už byla předána kupujícímu. Nový odkaz vystavit nelze.",
        409,
        "already_handed_over",
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
      return jsonError(
        "Pozvánku se nepodařilo vytvořit. Zkuste to prosím znovu.",
        500,
        "create_failed",
      );
    }

    // Org, pod kterou pas vznikl (builder/manager link) — připojíme ho k auditu, aby
    // byla pozvánka pro členy firmy dohledatelná (audit_read filtruje na household_id
    // NEBO organization_id; bez něj by řádek nikdo nepřečetl). Čteme přes RLS klienta:
    // org member na svůj link vidí. Pro spotřebitelské předání (vlastník bez orgu)
    // zůstane null — audit pak nese household kontext z accept fáze.
    const { data: orgLinks } = await sb
      .from("property_org_links")
      .select("organization_id")
      .eq("property_id", parsed.propertyId)
      .limit(1);
    const organizationId =
      (orgLinks as { organization_id: string }[] | null)?.[0]?.organization_id ?? null;

    // Jméno organizace do e-mailu ("Společnost X pro vás připravila…"). Čteme přes
    // service role keyed na už ověřené organizationId: volající je autorizován k
    // nemovitosti, ale nemusí mít přímý RLS read na řádek organizace, a chceme se
    // vyhnout tomu, aby orgName zbytečně padlo na null. Jen čtení názvu, best-effort.
    let orgName: string | null = null;
    if (organizationId) {
      const { data: org } = await createAdminClient()
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .maybeSingle();
      orgName = (org as { name: string } | null)?.name ?? null;
    }

    // audit_events má jen SELECT policy (RLS); zápis proto vede přes service role.
    await createAdminClient().from("audit_events").insert({
      actor_id: user.id,
      organization_id: organizationId,
      property_id: parsed.propertyId,
      action: "handover.invited",
      target: { buyer_email: parsed.buyerEmail, invitation_id: invitation.id },
    });

    // Sdílecí odkaz musí být VEŘEJNÝ — kupující ho dostane e-mailem. Za reverzní
    // proxy je request.url interní (localhost), proto preferujeme NEXT_PUBLIC_APP_URL
    // a forwarded hlavičky (viz origin.ts).
    const origin = publicOrigin(request);
    const url = `${origin}/prevzit/${invitation.token}`;

    // Odešli kupujícímu e-mail s claim odkazem. BEST-EFFORT: helper sám nikdy
    // nevyhazuje (no-op bez RESEND_API_KEY, chyby polyká), ale i tak obalíme
    // try/catch — selhání e-mailu NESMÍ shodit pozvánku. Odkaz vracíme vždy, aby
    // ho šlo zkopírovat ručně. Výsledek promítneme do pole `emailed`.
    let emailed = false;
    try {
      const res = await sendHandoverInvitation(invitation.buyer_email, {
        propertyTitle: (prop as { title: string | null }).title,
        claimUrl: url,
        orgName,
      });
      emailed = res.ok;
    } catch {
      emailed = false;
    }

    return NextResponse.json({
      id: invitation.id,
      token: invitation.token,
      buyerEmail: invitation.buyer_email,
      status: invitation.status,
      expiresAt: invitation.expires_at,
      url,
      path: `/prevzit/${invitation.token}`,
      emailed,
    });
  } catch {
    // Poslední záchrana: cokoli neočekávaného skončí jako čistý JSON 500.
    return jsonError("Neočekávaná chyba serveru", 500, "internal_error");
  }
}
