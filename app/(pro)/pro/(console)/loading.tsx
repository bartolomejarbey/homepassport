// /pro — skeleton během načítání B2B konzole. Dashboard čte organizace uživatele,
// pak její pasy nemovitostí a statistiky předání (sekvenční řetězec závislých dotazů).
// Bez kostry by se po prokliku na chvíli ukázal prázdný <main>. Kostra kopíruje
// reálné rozložení (hlavička s akcí → tři dlaždice → banner AI → poslední pasy),
// aby přechod nepřeskakoval. Stejný vzor jako prehled/loading.tsx, scoped per-route.
//
// Pozn.: tato kostra platí pro /pro (dashboard). Vnořené /pro/nemovitosti a
// /pro/nemovitosti/[id] mají vlastní, bližší loading.tsx.
export default function ProDashboardLoading() {
  return (
    <div className="animate-pulse space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání konzole…</span>

      {/* Hlavička: štítek + název firmy + podtitulek vlevo, tlačítko „Nový pas“ vpravo */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-3.5 w-20 rounded bg-surface-2" />
          <div className="mt-2 h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-96 max-w-[90%] rounded bg-surface-2" />
        </div>
        <div className="h-9 w-40 rounded-md bg-surface-2" />
      </div>

      {/* Tři dlaždice statistik */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="h-9 w-9 rounded-md bg-surface-2" />
            <div className="mt-3 h-7 w-12 rounded-md bg-surface-2" />
            <div className="mt-1.5 h-4 w-32 rounded bg-surface-2" />
          </div>
        ))}
      </div>

      {/* Banner „AI roztřídí dokumenty“ */}
      <div className="card border-honey/40 bg-honey-100/40 p-5">
        <div className="h-5 w-72 max-w-[70%] rounded bg-surface-2" />
        <div className="mt-2 h-4 w-full max-w-xl rounded bg-surface-2" />
      </div>

      {/* Poslední pasy — nadpis + několik řádků nemovitostí */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-36 rounded bg-surface-2" />
          <div className="h-4 w-40 rounded bg-surface-2" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
          >
            <div className="h-11 w-11 shrink-0 rounded-md bg-surface-2" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-5 w-52 max-w-[55%] rounded bg-surface-2" />
                <div className="h-5 w-24 rounded bg-surface-2" />
              </div>
              <div className="mt-1.5 h-4 w-64 max-w-[75%] rounded bg-surface-2" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="h-9 w-28 rounded-md bg-surface-2" />
              <div className="h-9 w-28 rounded-md bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
