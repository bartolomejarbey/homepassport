// /pro/nemovitosti/[id] — skeleton během načítání detailu firemního pasu. Stránka
// čte nemovitost a paralelně dokumenty pasu (s podepsanými URL zdrojů) i stav předání.
// Bez kostry by se po prokliku na chvíli ukázal prázdný <main>. Kostra kopíruje
// reálné rozložení (zpět → hlavička se štítky → banner AI → mřížka dokumenty +
// karta nahrávání), aby přechod nepřeskakoval. Stejný vzor jako prehled/loading.tsx,
// scoped per-route.
export default function ProPropertyDetailLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání pasu nemovitosti…</span>

      {/* Odkaz zpět */}
      <div className="h-4 w-48 rounded bg-surface-2" />

      {/* Hlavička: nadpis + štítky vlevo, dialog předání vpravo */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-8 w-64 max-w-[60%] rounded-md bg-surface-2" />
            <div className="h-5 w-28 rounded bg-surface-2" />
          </div>
          <div className="mt-2 h-4 w-72 max-w-[80%] rounded bg-surface-2" />
        </div>
        <div className="h-9 w-44 rounded-md bg-surface-2" />
      </div>

      {/* Banner „nahrajte dokumentaci“ */}
      <div className="card border-honey/40 bg-honey-100/40 py-4">
        <div className="h-4 w-full max-w-2xl rounded bg-surface-2" />
      </div>

      {/* Dvě sloupce: seznam dokumentů pasu + karta nahrávání */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="order-2 space-y-3 lg:order-1">
          <div className="h-5 w-44 rounded bg-surface-2" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card flex items-center gap-4 p-4">
                <div className="h-10 w-10 shrink-0 rounded-md bg-surface-2" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-48 max-w-[70%] rounded bg-surface-2" />
                  <div className="mt-1.5 h-3 w-32 rounded bg-surface-2" />
                </div>
                <div className="h-5 w-20 shrink-0 rounded bg-surface-2" />
              </div>
            ))}
          </div>
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
