// Hledat — přirozený asistent nad vlastními daty (dokumenty + majetek).
// Server Component: jen rám a vysvětlení; samotné hledání řeší klientský
// SearchBox přes /api/ai/search. Odpovídá výhradně z dat uživatele.
import { Sparkles } from "lucide-react";
import { SearchBox } from "./_components/SearchBox";

export const metadata = { title: "Hledat — Home Passport" };

export default function HledatPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm text-muted">Asistent</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink sm:text-3xl">
          Hledat ve svých datech
          <Sparkles size={20} className="text-honey" />
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Zeptejte se vlastními slovy — projdu jen vaše dokumenty a majetek a
          odpovím s odkazy na zdroj. Nic mimo vaše data si nevymýšlím.
        </p>
      </header>

      <SearchBox />
    </div>
  );
}
