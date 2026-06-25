// Dokumenty — skeleton během načítání seznamu dokumentů. Stránka /dokumenty čte
// členství domácnosti, případně nemovitost z ?property= a samotný seznam dokumentů
// (s vnořenými extrakcemi). Bez kostry by se po prokliku na chvíli ukázal prázdný
// <main>. Kostra kopíruje reálné rozložení (hlavička → mřížka seznam + karta nahrávání),
// aby přechod nepřeskakoval. Stejný vzor jako prehled/loading.tsx, scoped per-route.
export default function DokumentyLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání dokumentů…</span>

      {/* Hlavička: štítek + nadpis + podtitulek */}
      <div>
        <div className="h-3.5 w-24 rounded bg-surface-2" />
        <div className="mt-2 h-8 w-72 max-w-[70%] rounded-md bg-surface-2" />
        <div className="mt-2 h-4 w-96 max-w-[90%] rounded bg-surface-2" />
      </div>

      {/* Dvě sloupce: seznam dokumentů + karta nahrávání (stejná mřížka). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="order-2 space-y-2 lg:order-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex items-center gap-4 p-4">
              <div className="h-10 w-10 shrink-0 rounded-md bg-surface-2" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-48 max-w-[70%] rounded bg-surface-2" />
                <div className="mt-1.5 h-3 w-24 rounded bg-surface-2" />
              </div>
              <div className="h-5 w-20 shrink-0 rounded bg-surface-2" />
            </div>
          ))}
        </section>

        <aside className="order-1 lg:order-2">
          <div className="card space-y-4 p-5">
            <div className="h-5 w-40 rounded bg-surface-2" />
            <div className="h-28 w-full rounded-md bg-surface-2" />
            <div className="h-9 w-full rounded-md bg-surface-2" />
          </div>
        </aside>
      </div>
    </div>
  );
}
