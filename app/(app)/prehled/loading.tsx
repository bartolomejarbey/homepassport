// Přehled — skeleton během načítání dat dashboardu. Stránka /prehled dělá několik
// dotazů do DB najednou; bez tohoto by se po prokliku na chvíli ukázal prázdný
// <main>. Kostra kopíruje reálné rozložení (hlavička → 4 dlaždice → rychlé akce),
// aby přechod nepřeskakoval. Stejný vzor jako (auth)/loading.tsx.
export default function PrehledLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání přehledu…</span>

      {/* Hlavička: nadpis + pozdrav + podtitulek */}
      <div>
        <div className="h-3.5 w-16 rounded bg-surface-2" />
        <div className="mt-2 h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
        <div className="mt-2 h-4 w-80 max-w-[85%] rounded bg-surface-2" />
      </div>

      {/* Souhrnné dlaždice — stejná mřížka jako reálný přehled */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="h-4 w-24 rounded bg-surface-2" />
              <div className="h-4 w-4 rounded bg-surface-2" />
            </div>
            <div className="mt-3 h-8 w-14 rounded-md bg-surface-2" />
            <div className="mt-2 h-3 w-28 rounded bg-surface-2" />
          </div>
        ))}
      </div>

      {/* Rychlé akce */}
      <div className="space-y-3">
        <div className="h-5 w-32 rounded bg-surface-2" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex items-center gap-3 p-5">
              <div className="h-9 w-9 shrink-0 rounded-md bg-surface-2" />
              <div className="h-4 w-28 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
