// /pro/poptavka — veřejná stránka pro vývojáře a stavební firmy, které chtějí
// vyzkoušet Home Passport v pilotu. Cílí na CTA "Domluvit pilot" z úvodní stránky.
// Formulář je plně funkční: sestaví strukturovaný e-mail (mailto) na obchodní
// adresu — žádné mrtvé tlačítko, žádný skrytý backend. K dispozici jsou i přímé
// kontakty. Stránka je záměrně mimo přihlašovací bránu konzole (firma účet ještě
// nemá), proto žije nad pro/(console)/layout.tsx.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const SALES_EMAIL = "pilot@homepassport.cz";
const SALES_PHONE = "+420 777 123 456";

const SIZE_OPTIONS = [
  { value: "do-10", label: "Do 10 jednotek ročně" },
  { value: "10-50", label: "10–50 jednotek ročně" },
  { value: "50-200", label: "50–200 jednotek ročně" },
  { value: "200-plus", label: "Více než 200 jednotek ročně" },
];

export default function PilotRequestPage() {
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState(SIZE_OPTIONS[1].value);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const sizeLabel = useMemo(
    () => SIZE_OPTIONS.find((o) => o.value === size)?.label ?? size,
    [size],
  );

  const valid = company.trim().length >= 2 && name.trim().length >= 2 && /.+@.+\..+/.test(email);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;

    const subject = `Žádost o pilot Home Passport — ${company.trim()}`;
    const body = [
      "Dobrý den,",
      "",
      "rádi bychom vyzkoušeli Home Passport pro firmy v pilotním provozu.",
      "",
      `Firma: ${company.trim()}`,
      `Kontaktní osoba: ${name.trim()}`,
      `E-mail: ${email.trim()}`,
      phone.trim() ? `Telefon: ${phone.trim()}` : null,
      `Objem: ${sizeLabel}`,
      note.trim() ? `\nPoznámka:\n${note.trim()}` : null,
      "",
      "Děkujeme.",
    ]
      .filter(Boolean)
      .join("\n");

    const href = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;

    // Otevře poštovního klienta s předvyplněnou, strukturovanou poptávkou.
    window.location.href = href;
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-navy"
      >
        <ArrowLeft size={15} />
        Zpět na úvod
      </Link>

      <header>
        <span className="badge bg-honey-100 text-honey-600">
          <Building2 size={13} /> Pro developery a stavební firmy
        </span>
        <h1 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Domluvte si pilot
        </h1>
        <p className="mt-2 max-w-xl text-ink-soft">
          Vyzkoušejte Home Passport na reálném projektu. Pomůžeme vám založit první
          pasy nemovitostí, nahrát dokumentaci a předat ji kupujícím — bez papírování
          a v souladu s EPBD.
        </p>
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        {/* ---------- Formulář ---------- */}
        <div className="card p-6">
          {sent ? (
            <div className="flex flex-col items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md bg-teal-100">
                <CheckCircle2 size={22} className="text-teal" />
              </span>
              <h2 className="font-display text-xl font-semibold text-ink">
                Poptávka je připravena k odeslání
              </h2>
              <p className="text-sm text-ink-soft">
                Otevřeli jsme vašeho poštovního klienta s předvyplněnou zprávou na{" "}
                <span className="font-medium text-ink">{SALES_EMAIL}</span>. Stačí ji
                odeslat — ozveme se do dvou pracovních dnů.
              </p>
              <p className="text-sm text-ink-soft">
                Nic se neotevřelo? Napište nám přímo na{" "}
                <a className="font-medium text-navy hover:text-navy-700" href={`mailto:${SALES_EMAIL}`}>
                  {SALES_EMAIL}
                </a>
                .
              </p>
              <Button variant="ghost" type="button" onClick={() => setSent(false)} className="mt-1">
                Upravit poptávku
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-ink">
                  Název firmy
                </label>
                <Input
                  id="company"
                  name="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Např. Novostavby Morava s.r.o."
                  autoComplete="organization"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">
                    Kontaktní osoba
                  </label>
                  <Input
                    id="name"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jméno a příjmení"
                    autoComplete="name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                    Pracovní e-mail
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vy@firma.cz"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink">
                    Telefon <span className="text-muted">(nepovinné)</span>
                  </label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+420…"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label htmlFor="size" className="mb-1.5 block text-sm font-medium text-ink">
                    Objem výstavby
                  </label>
                  <select
                    id="size"
                    name="size"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                  >
                    {SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-ink">
                  Co řešíte? <span className="text-muted">(nepovinné)</span>
                </label>
                <textarea
                  id="note"
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Např. počet projektů, termín předání, soulad s EPBD…"
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                />
              </div>

              <Button type="submit" variant="honey" disabled={!valid} className="w-full sm:w-auto">
                <Send size={15} />
                Odeslat poptávku
              </Button>
              <p className="text-xs text-muted">
                Odesláním souhlasíte s tím, že vás kontaktujeme ohledně pilotu. Data
                zpracováváme v EU a nesdílíme s třetími stranami.
              </p>
            </form>
          )}
        </div>

        {/* ---------- Postranní panel ---------- */}
        <aside className="space-y-4">
          <div className="card p-5">
            <p className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Sparkles size={16} className="text-honey-600" /> Co pilot zahrnuje
            </p>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-soft">
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal" />
                Založení firemní konzole a prvních pasů nemovitostí.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal" />
                Automatické čtení dokumentů (PENB, revize, návody) pomocí AI.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal" />
                Předání pasu kupujícímu jediným odkazem.
              </li>
            </ul>
          </div>

          <div className="card p-5">
            <p className="font-display text-base font-semibold text-ink">Raději napřímo?</p>
            <a
              href={`mailto:${SALES_EMAIL}`}
              className="mt-3 flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-700"
            >
              <Mail size={15} className="text-honey-600" />
              {SALES_EMAIL}
            </a>
            <a
              href={`tel:${SALES_PHONE.replace(/\s+/g, "")}`}
              className="mt-2 flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-700"
            >
              <Phone size={15} className="text-honey-600" />
              {SALES_PHONE}
            </a>
          </div>

          <div className="card flex items-start gap-2.5 p-5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal" />
            <p className="text-xs text-ink-soft">
              Osobní data prodávajícího se nikdy nepřenášejí — kupujícímu předáváte
              jen vrstvu o nemovitosti. Hosting i zpracování probíhá v EU.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
