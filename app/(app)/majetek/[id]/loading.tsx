// Detail položky majetku — skeleton během načítání. Stránka /majetek/[id] čte položku
// a paralelně fotky i připojené dokumenty, pak podepsanou URL první fotky. Bez kostry
// by se po prokliku na chvíli ukázal prázdný <main>. Kostra kopíruje reálné rozložení
// (zpět → hlavička → dvě karty položka + odhad → sekce dokumentů), aby přechod
// nepřeskakoval. Stejný vzor jako prehled/loading.tsx, scoped per-route.
export default function MajetekDetailLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání položky majetku…</span>

      {/* Odkaz zpět */}
      <div className="h-4 w-36 rounded bg-surface-2" />

      {/* Hlavička: název + datum vlevo, štítek zdroje vpravo */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-36 rounded bg-surface-2" />
        </div>
        <div className="h-5 w-24 rounded bg-surface-2" />
      </div>

      {/* Dvě karty: položka (fotka + údaje) + odhad hodnoty */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-0">
          <div className="border-b border-line px-5 py-3">
            <div className="h-5 w-28 rounded bg-surface-2" />
          </div>
          <div className="p-5">
            <div className="mb-4 h-40 w-full rounded-md bg-surface-2" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 w-28 shrink-0 rounded bg-surface-2" />
                  <div className="h-4 w-40 rounded bg-surface-2" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card p-0">
          <div className="border-b border-line px-5 py-3">
            <div className="h-5 w-32 rounded bg-surface-2" />
          </div>
          <div className="space-y-4 p-5">
            <div className="h-12 w-48 rounded-md bg-surface-2" />
            <div className="h-16 w-full rounded-md bg-surface-2" />
            <div className="h-9 w-44 rounded-md bg-surface-2" />
          </div>
        </div>
      </div>

      {/* Sekce záruk a dokumentů */}
      <div>
        <div className="h-5 w-44 rounded bg-surface-2" />
        <div className="mt-2 h-4 w-72 max-w-[80%] rounded bg-surface-2" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card h-16 p-4" />
          ))}
        </div>
      </div>
    </div>
  );
}
