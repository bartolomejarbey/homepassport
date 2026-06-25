// POST /api/handover/accept — kupující převezme pas nemovitosti do své domácnosti.
// Token je nositelem oprávnění: pozvánku ani nemovitost ještě nevidí přes RLS
// (can_access_property je false, dokud neexistuje property_owners vazba), proto
// čteme a zapisujeme service-role klientem (admin) — stejný "chicken-and-egg"
// vzorec jako při zakládání nemovitosti.
//
// Krok po kroku: ověř přihlášení -> validuj token (existuje, pending, neexpiroval)
// -> najdi domácnost kupujícího -> claimni pozvánku atomicky ('pending'->'accepted')
// -> propoj property_owners -> přesuň přenosné dokumenty do household kupujícího
// (storage prefix + documents.file_path/household_id) -> nastav nemovitost 'active'
// -> zapiš audit_event. Přenáší se POUZE nemovitost (přenosná vrstva), nikdy
// soukromá data původního majitele. Celý tok je idempotentní: opakované převzetí
// tímtéž uživatelem jen dožene případně nedokončený přesun souborů.
//
// Přijímá JSON (fetch -> vrací JSON) i form-encoded (progressive enhancement ze
// stránky /prevzit/[token] -> přesměrovává na detail nebo zpět s ?error=).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicOrigin } from "../origin";
import { handoverAcceptBody as Body } from "@/lib/validation/schemas";
import { jsonError, rejectIfTooLarge } from "@/lib/util/api";

// Mapování interních chyb na krátké kódy pro ?error= při form POST.
type ErrCode = "expired" | "taken" | "nohousehold" | "failed";

export async function POST(request: Request) {
  // Redirecty po form POST musí vést na VEŘEJNÝ origin (za proxy je request.url
  // interní localhost), jinak by prohlížeč skončil na neveřejné adrese.
  const origin = publicOrigin(request);
  const contentType = request.headers.get("content-type") ?? "";
  const wantsRedirect = contentType.includes("application/x-www-form-urlencoded");

  // Tělo nese jen krátký token — větší požadavek odmítneme předem. U form POST
  // přesměrujeme zpět na homepage (token ještě neznáme), u fetch vrátíme JSON.
  if (rejectIfTooLarge(request, 8 * 1024)) {
    return wantsRedirect
      ? NextResponse.redirect(`${origin}/`, 303)
      : jsonError("Požadavek je příliš velký.", 413, "payload_too_large");
  }

  try {
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

    // 3) Stavy, které končí dřív, než cokoli zapíšeme (kromě idempotentního
    //    re-accept tímtéž uživatelem — ten propadne dolů k dokončení, aby se
    //    případný dříve nedokončený přesun dokumentů dohnal).
    const alreadyAcceptedBySelf =
      invitation.status === "accepted" && invitation.accepted_by === user.id;

    if (invitation.status === "accepted" && !alreadyAcceptedBySelf) {
      return fail("taken", "Tato pozvánka už byla uplatněna.", 409);
    }
    if (invitation.status === "revoked") {
      return fail("failed", "Pozvánka byla zrušena.", 410);
    }
    if (invitation.status !== "pending" && !alreadyAcceptedBySelf) {
      return fail("failed", "Pozvánka už není platná.", 410);
    }
    if (
      !alreadyAcceptedBySelf &&
      invitation.expires_at &&
      new Date(invitation.expires_at).getTime() < Date.now()
    ) {
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

    // 5) Pas má jediného nabyvatele: pokud ho už vlastní CIZÍ domácnost (starý/hraniční
    //    token, ručně podvržený claim), odmítni JEŠTĚ PŘED claimem pozvánky — tak ji
    //    zbytečně „nespotřebujeme" a hlavně nikdy nevlijeme přenosné dokumenty do druhé
    //    domácnosti. Vlastní existující vazba (idempotentní re-accept) projde a tok se
    //    jen dotáhne.
    const { data: owners } = await admin
      .from("property_owners")
      .select("household_id")
      .eq("property_id", invitation.property_id);
    const foreignOwner = (owners ?? []).some((o) => o.household_id !== householdId);
    if (foreignOwner) {
      return fail("taken", "Tuto nemovitost už převzala jiná domácnost.", 409);
    }

    // 6) Pozvánku claimni ATOMICKY jako úplně první zápis (update jen z 'pending').
    //    Tím se souběh vyřeší dřív, než cokoli přesuneme: případný "poražený"
    //    request se zde zastaví a nesáhne na property_owners ani na úložiště.
    //    Idempotentní re-accept tímtéž uživatelem claim přeskočí (už ho vlastní)
    //    a rovnou dokončí zbytek — to dělá celý tok bezpečně opakovatelný.
    if (!alreadyAcceptedBySelf) {
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
    }

    // 7) Propoj nemovitost s domácností kupujícího (přenosná vrstva přechází).
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

    // 8) Přenosné dokumenty přesměruj do domácnosti kupujícího.
    //
    //     Storage RLS (storage_household_ok) hlídá přístup podle PRVNÍHO segmentu
    //     cesty = <household_id>. Přenosné soubory byly nahrány pod household
    //     PRODÁVAJÍCÍHO, takže by je kupující po převzetí přes RLS-respecting
    //     klienta (/dokumenty, /nemovitost) neotevřel. Proto fyzicky přesuneme
    //     objekt pod prefix <buyer_household>/ a přepíšeme documents.file_path +
    //     documents.household_id. Tím přenos skutečně "funguje" — kupující soubory
    //     vidí svými běžnými toky, ne jen přes podpisy z této stránky.
    //
    //     Best-effort & idempotentní: soubor už pod správným prefixem přeskočíme;
    //     dílčí selhání přesunu zalogujeme do auditu, ale převzetí jím nerušíme —
    //     metadata i nemovitost přejdou tak jako tak a podpisy adminem fungují dál.
    const { data: transferableDocs } = await admin
      .from("documents")
      .select("id, file_path, household_id")
      .eq("property_id", invitation.property_id)
      .eq("transferable", true);

    const moveFailures: { id: string; error: string }[] = [];
    for (const doc of transferableDocs ?? []) {
      if (!doc.file_path) continue;
      const segments = doc.file_path.split("/");

      // Už pod správným prefixem (re-run / idempotence): jen srovnej household_id.
      if (segments[0] === householdId) {
        if (doc.household_id !== householdId) {
          await admin.from("documents").update({ household_id: householdId }).eq("id", doc.id);
        }
        continue;
      }

      // Cesta bez prvního (household) segmentu — zůstává stejný název i podsložky.
      const tail = segments.slice(1).join("/") || segments.join("/");
      const newPath = `${householdId}/${tail}`;

      const { error: moveErr } = await admin.storage
        .from("documents")
        .move(doc.file_path, newPath);

      // Idempotence pro DŘÍVE částečně dokončený přesun: pokud se přesun nezdaří,
      // ověř, zda objekt na cílové cestě UŽ neleží. Dva scénáře předchozího běhu:
      //   1) "exists" — move proběhl, ale objekt na cíli už byl (kolize názvu),
      //   2) zdroj "not found" — move proběhl minule, jen selhal následný UPDATE
      //      documents (soubor je na newPath, ale file_path stále ukazuje na starý).
      // V obou případech je pravdivý stav „objekt už je na cíli" — dotáhneme jen
      // metadata. Bez tohoto by osiřelý soubor zůstal navždy mimo dosah kupujícího.
      let destReady = !moveErr;
      if (moveErr) {
        if (moveErr.message?.toLowerCase().includes("exists")) {
          destReady = true;
        } else {
          // Existuje objekt přesně na cílové cestě? (list na rodičovské složce s
          // přesným prefixem názvu — admin obchází RLS.)
          const slash = newPath.lastIndexOf("/");
          const dir = slash >= 0 ? newPath.slice(0, slash) : "";
          const base = slash >= 0 ? newPath.slice(slash + 1) : newPath;
          const { data: listed } = await admin.storage
            .from("documents")
            .list(dir, { search: base, limit: 100 });
          destReady = (listed ?? []).some((o) => o.name === base);
        }
      }

      if (!destReady) {
        moveFailures.push({ id: doc.id, error: moveErr?.message ?? "move failed" });
        continue;
      }

      const { error: updErr } = await admin
        .from("documents")
        .update({ file_path: newPath, household_id: householdId })
        .eq("id", doc.id);
      if (updErr) moveFailures.push({ id: doc.id, error: updErr.message });
    }

    // 9) Nemovitost -> active (z draft / transferred po předchozím prodeji).
    await admin
      .from("properties")
      .update({ status: "active" })
      .eq("id", invitation.property_id);

    // 10) Audit: kdo, kdy, co převzal. Zaznamenáme i počet přenesených dokumentů
    //    a případná dílčí selhání přesunu souborů (pro pozdější dohledání).
    await admin.from("audit_events").insert({
      actor_id: user.id,
      household_id: householdId,
      property_id: invitation.property_id,
      action: alreadyAcceptedBySelf ? "handover.reconciled" : "handover.accepted",
      target: {
        invitation_id: invitation.id,
        documents_transferred: transferableDocs?.length ?? 0,
        ...(moveFailures.length > 0 ? { document_move_failures: moveFailures } : {}),
      },
    });

    return succeed(invitation.property_id, alreadyAcceptedBySelf ? { alreadyAccepted: true } : undefined);
  } catch {
    // Poslední záchrana: cokoli neočekávaného (výpadek DB/úložiště) skončí čistě.
    // Form POST pošleme zpět na stránku pozvánky s obecným ?error=failed (token
    // máme z URL referreru jen někdy, proto bezpečně zpět na homepage); fetch
    // dostane JSON 500. Atomický claim ('pending'->'accepted') zaručuje, že
    // případný pád po claimu nenechá pozvánku „rozpůlenou" pro jiného kupujícího —
    // opakované převzetí týmž uživatelem je idempotentní a dožene zbytek.
    return wantsRedirect
      ? NextResponse.redirect(`${origin}/?error=failed`, 303)
      : jsonError("Převzetí se nepodařilo dokončit.", 500, "internal_error");
  }
}
