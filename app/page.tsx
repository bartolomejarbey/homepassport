import Link from "next/link";
import {
  FileText, ScanLine, BellRing, ShieldCheck, Building2, Home,
  ArrowRight, Boxes, KeyRound, Sparkles,
} from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-50 border-b bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-navy text-honey">
              <KeyRound size={17} />
            </span>
            <span className="font-display text-lg font-semibold text-ink">Home Passport</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
            <a href="#produkt" className="hover:text-navy">Produkt</a>
            <a href="#pro-firmy" className="hover:text-navy">Pro firmy</a>
            <a href="#bezpecnost" className="hover:text-navy">Bezpečnost</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/prihlaseni" className="btn btn-ghost text-sm">Přihlásit</Link>
            <Link href="/registrace" className="btn btn-primary text-sm">Vyzkoušet</Link>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <span className="badge bg-honey-100 text-honey-600">
            <Sparkles size={13} /> Kompatibilní s EU Digital Building Logbook
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold text-ink md:text-6xl">
            Celý váš domov.<br />
            <span className="text-navy">Jeden digitální pas.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">
            Dokumenty, majetek, záruky a revize na jednom místě — chytře čtené umělou
            inteligencí. Pas, který při prodeji předáte novému majiteli jediným odkazem.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/registrace" className="btn btn-primary">
              Založit pas zdarma <ArrowRight size={16} />
            </Link>
            <Link href="#pro-firmy" className="btn btn-ghost">
              <Building2 size={16} /> Jsem developer / stavební firma
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">Data uložená v EU · šifrováno · bez sdílení třetím stranám.</p>
        </div>
      </section>

      {/* ---------- Dual audience ---------- */}
      <section id="produkt" className="border-y bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 md:grid-cols-2">
          <div className="card p-7">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-100 text-teal"><Home size={20} /></span>
            <h3 className="mt-4 text-2xl text-ink">Home OS — pro majitele</h3>
            <p className="mt-2 text-ink-soft">Provoz domácnosti bez papírů a stresu z termínů.</p>
            <ul className="mt-5 space-y-2.5 text-sm text-ink-soft">
              <li className="flex gap-2"><ScanLine size={17} className="mt-0.5 shrink-0 text-navy" /> Vyfoťte fakturu — AI z ní vytáhne záruku, částku i datum.</li>
              <li className="flex gap-2"><BellRing size={17} className="mt-0.5 shrink-0 text-navy" /> Připomínky revizí a konců záruk přesně podle vašeho domu.</li>
              <li className="flex gap-2"><Boxes size={17} className="mt-0.5 shrink-0 text-navy" /> Soupis majetku z fotek + odhad hodnoty pro pojistku.</li>
            </ul>
          </div>
          <div className="card p-7">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-honey-100 text-honey-600"><Building2 size={20} /></span>
            <h3 className="mt-4 text-2xl text-ink">Home Passport — pro firmy</h3>
            <p className="mt-2 text-ink-soft">Předejte kupci hotový digitální pas nemovitosti.</p>
            <ul className="mt-5 space-y-2.5 text-sm text-ink-soft">
              <li className="flex gap-2"><FileText size={17} className="mt-0.5 shrink-0 text-honey-600" /> Projekt, kolaudace, PENB a revize na jednom místě.</li>
              <li className="flex gap-2"><KeyRound size={17} className="mt-0.5 shrink-0 text-honey-600" /> Předání pasu odkazem — kupec si aktivuje účet.</li>
              <li className="flex gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-honey-600" /> Vaše značka, váš nadstandard a soulad s EPBD.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- AI features ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-3xl text-ink md:text-4xl">AI, která dělá nudnou práci za vás</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">Nahrajete podklady, zbytek obstará umělá inteligence.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { icon: <FileText size={20} />, t: "Čtení dokumentů", d: "Z PDF i fotek vytáhne dodavatele, částky, konce záruk a čísla revizí. Termíny se založí samy." },
            { icon: <ScanLine size={20} />, t: "Rozpoznání z fotek", d: "Vyfoťte místnost — AI rozpozná a zařadí vybavení do soupisu majetku." },
            { icon: <Sparkles size={20} />, t: "Chytré hledání", d: "„Kde je kupní smlouva?“ „Kdy končí záruka pračky?“ Odpoví a doloží zdroj." },
          ].map((f) => (
            <div key={f.t} className="card p-6">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-navy">{f.icon}</span>
              <h3 className="mt-4 text-xl text-ink">{f.t}</h3>
              <p className="mt-2 text-sm text-ink-soft">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- B2B band ---------- */}
      <section id="pro-firmy" className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <span className="badge bg-white/10 text-honey-100">Pro developery a stavební firmy</span>
            <h2 className="mt-4 text-3xl text-white md:text-4xl">Pas nemovitosti jako součást předání klíčů</h2>
            <p className="mt-4 max-w-xl text-white/80">
              Založte pas, naplňte ho technickou dokumentací a předejte kupci. Zvyšte
              vnímanou hodnotu, vyřešte EPBD a zůstaňte s klientem v kontaktu i po prodeji.
            </p>
            <Link href="/pro/poptavka" className="btn btn-honey mt-6">Domluvit pilot <ArrowRight size={16} /></Link>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/5 p-6 text-sm">
            <div className="font-mono text-honey-100">PŘEDÁNÍ</div>
            <ol className="mt-3 space-y-3 text-white/85">
              <li>1 — Firma založí <b>pas nemovitosti</b></li>
              <li>2 — Vygeneruje <b>předávací odkaz</b></li>
              <li>3 — Kupec převezme pas a aktivuje <b>Home OS</b></li>
            </ol>
            <p className="mt-4 text-xs text-white/55">Osobní data prodávajícího se nepřenášejí — předává se jen vrstva o nemovitosti.</p>
          </div>
        </div>
      </section>

      {/* ---------- Security ---------- */}
      <section id="bezpecnost" className="mx-auto max-w-6xl px-5 py-20">
        <div className="card p-8 md:p-10">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-teal-100 text-teal"><ShieldCheck size={22} /></span>
          <h2 className="mt-4 text-3xl text-ink">Vaše data, pod kontrolou</h2>
          <div className="mt-6 grid gap-6 text-sm text-ink-soft md:grid-cols-3">
            <div><b className="text-ink">Uloženo v EU</b><p className="mt-1">Hosting i zpracování v Evropské unii. Šifrováno při přenosu i uložení.</p></div>
            <div><b className="text-ink">Oddělená osobní data</b><p className="mt-1">Při prodeji předáte pas nemovitosti, ne svoje soukromé doklady.</p></div>
            <div><b className="text-ink">Export i výmaz</b><p className="mt-1">Svá data kdykoli stáhnete nebo smažete. Stavěno dle ISO 27001.</p></div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted md:flex-row">
          <span>© {new Date().getFullYear()} Home Passport</span>
          <span className="font-mono text-xs">Postaveno pro české domácnosti · data v EU</span>
        </div>
      </footer>
    </main>
  );
}
