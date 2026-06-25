// /prevzit/[token] — veřejná (token-based) stránka pro převzetí pasu nemovitosti.
// Zobrazí jen PŘENOSNOU vrstvu nemovitosti (adresa, typ, kontext systémů, sekce
// pasu, počet přenosných dokumentů) — NIKDY osobní data prodávajícího. Token je
// nositelem oprávnění, proto čteme adminem (kupující ještě nemá RLS přístup).
// Přihlášený uživatel může nemovitost převzít (POST /api/handover/accept),
// nepřihlášený je vyzván k registraci s tokenem neseným v ?next.
import Link from "next/link";
import {
  ArrowRightLeft,
  ShieldCheck,
  Lock,
  MapPin,
  Clock,
  AlertCircle,
  FileText,
  Home,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Převzetí pasu nemovitosti — Home Passport" };

type Params = { token: string };

const TYPE_LABELS: Record<string, string> = {
  house: "Rodinný dům",
  apartment: "Byt",
  unit: "Jednotka",
  land: "Pozemek",
  commercial: "Komerční prostor",
};

const KIND_LABELS: Record<string, string> = {
  construction: "Konstrukce",
  technology: "Technologie",
  penb: "PENB",
  inspections: "Revize",
  warranties: "Záruky",
  manuals: "Návody",
  equipment: "Vybavení",
};

function propertyName(p: {
  title: string | null;
  type: string;
  street: string | null;
  city: string | null;
}): string {
  if (p.title && p.title.trim()) return p.title.trim();
  const typeLabel = TYPE_LABELS[p.type] ?? "Nemovitost";
  const where = [p.street, p.city].filter(Boolean).join(", ");
  return where ? `${typeLabel} — ${where}` : typeLabel;
}

// Sdílený rám: hlavička v navy + obsah, ať i chybové stavy působí brandově.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper">
      <div className="border-b border-line bg-navy text-paper">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <ArrowRightLeft size={18} className="text-honey" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Home Passport
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">{children}</div>
    </main>
  );
}

// Jednotná chybová obrazovka pro neplatné / vypršelé / zrušené pozvánky.
function InvalidState({ title, hint }: { title: string; hint: string }) {
  return (
    <Shell>
      <div className="card flex flex-col items-center gap-2 p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-rust-100">
          <AlertCircle size={22} className="text-rust" />
        </span>
        <h1 className="mt-1 text-xl text-ink">{title}</h1>
        <p className="max-w-sm text-sm text-ink-soft">{hint}</p>
        <Link href="/" className="btn btn-ghost mt-3 text-sm">
          Zpět na úvod
        </Link>
      </div>
    </Shell>
  );
}

export default async function PrevzitPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error: errorFlag } = await searchParams;

  // Chybové hlášky vrácené z route handleru po neúspěšném form POST.
  const ACCEPT_ERRORS: Record<string, string> = {
    expired: "Platnost pozvánky mezitím vypršela. Požádejte o nový odkaz.",
    taken: "Tuto pozvánku už mezitím někdo uplatnil.",
    nohousehold: "Nemáte založenou domácnost. Obnovte prosím stránku.",
    failed: "Převzetí se nepodařilo dokončit. Zkuste to prosím znovu.",
  };
  const acceptError = errorFlag ? ACCEPT_ERRORS[errorFlag] ?? ACCEPT_ERRORS.failed : null;

  // Token je bearer credential — čteme service-role klientem. Kupující k pozvánce
  // ani nemovitosti nemá RLS přístup, dokud nedojde k převzetí.
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("handover_invitations")
    .select("id, property_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) {
    return (
      <InvalidState
        title="Pozvánka nenalezena"
        hint="Tento odkaz k převzetí neexistuje nebo byl zadán chybně. Požádejte prodávajícího o nový odkaz."
      />
    );
  }

  const expired =
    !!invitation.expires_at &&
    new Date(invitation.expires_at).getTime() < Date.now();

  if (invitation.status === "revoked") {
    return (
      <InvalidState
        title="Pozvánka byla zrušena"
        hint="Prodávající tento odkaz k převzetí zneplatnil. Pro nový pokus si vyžádejte aktuální odkaz."
      />
    );
  }
  if (invitation.status === "expired" || (invitation.status === "pending" && expired)) {
    return (
      <InvalidState
        title="Platnost pozvánky vypršela"
        hint="Tento odkaz k převzetí už není platný. Požádejte prodávajícího o vystavení nového."
      />
    );
  }
  if (invitation.status === "accepted") {
    return (
      <InvalidState
        title="Pas už byl převzat"
        hint="Tato nemovitost už byla převzata do domácnosti kupujícího. Pokud jste to byli vy, najdete ji ve svém přehledu."
      />
    );
  }

  // status === 'pending' a neexpirováno: načti PŘENOSNOU vrstvu nemovitosti.
  // Vědomě NEnačítáme household, property_owners, osobní doklady ani kontakty.
  const [{ data: property }, { data: context }, { data: sections }, { count: docCount }] =
    await Promise.all([
      admin
        .from("properties")
        .select("id, type, title, street, city, postal_code, country")
        .eq("id", invitation.property_id)
        .maybeSingle(),
      admin
        .from("property_contexts")
        .select(
          "has_chimney, has_gas, has_electrical, has_lps, has_pv, owner_occupied, rental, svj, business_use",
        )
        .eq("property_id", invitation.property_id)
        .maybeSingle(),
      admin
        .from("passport_sections")
        .select("id, kind, title")
        .eq("property_id", invitation.property_id)
        .order("created_at", { ascending: true }),
      // Počet přenosných dokumentů — pouze ty, které putují s nemovitostí.
      admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("property_id", invitation.property_id)
        .eq("transferable", true),
    ]);

  if (!property) {
    return (
      <InvalidState
        title="Nemovitost není dostupná"
        hint="Pas k této pozvánce se nepodařilo načíst. Požádejte prodávajícího o nový odkaz."
      />
    );
  }

  // Je návštěvník přihlášený? (RLS-respecting klient kvůli auth.uid().)
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const address = [
    property.street,
    [property.postal_code, property.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  // Přítomné technické systémy -> štítky (z přenosného kontextu).
  const systems = [
    context?.has_chimney && "Komín",
    context?.has_gas && "Plyn",
    context?.has_electrical && "Elektroinstalace",
    context?.has_lps && "Hromosvod",
    context?.has_pv && "Fotovoltaika",
  ].filter(Boolean) as string[];

  const sectionRows = sections ?? [];
  const transferableDocs = docCount ?? 0;

  // Pro nepřihlášené neseme token přes ?next zpět na tuto stránku. Pod typovanými
  // routami předáváme cíl jako UrlObject (pathname + query), ne jako řetězec.
  const here = `/prevzit/${token}`;
  const registerHref = { pathname: "/registrace", query: { next: here } };
  const loginHref = { pathname: "/prihlaseni", query: { next: here } };

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <span className="badge bg-honey-100 text-honey-600">
            <ArrowRightLeft size={12} /> Předání pasu
          </span>
          <h1 className="mt-3 text-2xl text-ink sm:text-3xl">
            Převezměte pas nemovitosti
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Prodávající vám předává digitální pas této nemovitosti. Po převzetí
            ho budete spravovat ve své domácnosti.
          </p>
        </div>

        {/* Karta nemovitosti — jen přenosná data */}
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy text-paper">
              <Home size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink">
                {propertyName(property)}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
                <span className="text-muted">
                  {TYPE_LABELS[property.type] ?? "Nemovitost"}
                </span>
                {address && (
                  <>
                    <span className="text-line">·</span>
                    <MapPin size={14} className="text-muted" />
                    <span>{address}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {systems.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Technické systémy
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {systems.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink-soft"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <ShieldCheck size={16} className="shrink-0 text-teal" />
              <span>
                <span className="font-semibold text-ink">{sectionRows.length}</span>{" "}
                {sectionRows.length === 1 ? "sekce pasu" : "sekcí pasu"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-ink-soft">
              <FileText size={16} className="shrink-0 text-honey" />
              <span>
                <span className="font-semibold text-ink">{transferableDocs}</span>{" "}
                {transferableDocs === 1 ? "přenosný dokument" : "přenosných dokumentů"}
              </span>
            </div>
          </div>

          {sectionRows.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Obsah pasu
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {sectionRows.map((s) => (
                  <li key={s.id}>
                    <span className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-soft">
                      {s.title?.trim() || KIND_LABELS[s.kind] || s.kind}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Co se přenáší a co NE — klíčový mentální model + GDPR ujištění */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="card border-teal/30 bg-teal-100/40 p-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-teal" />
              <p className="font-display text-sm font-semibold text-ink">
                Přenáší se na vás
              </p>
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              Pas nemovitosti — konstrukce, technologie, PENB, revize, záruky a
              dokumenty výslovně označené jako přenosné.
            </p>
          </div>
          <div className="card border-line bg-surface-2/60 p-4">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-ink-soft" />
              <p className="font-display text-sm font-semibold text-ink">
                Nepřenáší se
              </p>
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              Osobní doklady, faktury a movitý majetek prodávajícího zůstávají
              jeho domácnosti. Tato data k vám nikdy nepřejdou.
            </p>
          </div>
        </div>

        {/* Akce: přihlášený převezme, nepřihlášený se registruje */}
        {user ? (
          <div className="card p-5">
            {acceptError && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{acceptError}</span>
              </div>
            )}
            <p className="font-display text-base font-semibold text-ink">
              Vše připraveno k převzetí
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Pas této nemovitosti přidáme do vaší domácnosti. Soukromá data
              prodávajícího se nepřevádějí.
            </p>
            {/* Form POST na route handler — funguje i bez JavaScriptu.
                Po úspěchu route přesměruje na detail převzaté nemovitosti. */}
            <form action="/api/handover/accept" method="post" className="mt-4">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn btn-primary w-full text-sm">
                <ArrowRightLeft size={16} />
                Převzít do mé domácnosti
              </button>
            </form>
          </div>
        ) : (
          <div className="card p-5">
            <p className="font-display text-base font-semibold text-ink">
              Pro převzetí se přihlaste
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Pas převezmeme do vaší domácnosti. Stačí si založit účet zdarma —
              po registraci vás vrátíme přesně sem.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link href={registerHref} className="btn btn-primary text-sm sm:flex-1">
                Založit účet a převzít
              </Link>
              <Link href={loginHref} className="btn btn-ghost text-sm sm:flex-1">
                Už mám účet — přihlásit se
              </Link>
            </div>
          </div>
        )}

        {invitation.expires_at && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <Clock size={13} />
            Odkaz je platný do{" "}
            {new Date(invitation.expires_at).toLocaleDateString("cs-CZ", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
        )}
      </div>
    </Shell>
  );
}
