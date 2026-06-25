// Detail nemovitosti — skeleton během načítání pasu. Stránka /nemovitost/[id] čte
// nemovitost a paralelně její kontext, sekce pasu a čtyři počty (přenosné/soukromé
// dokumenty, otevřené revize, majetek). Bez kostry by se po prokliku na chvíli
// ukázal prázdný <main>. Kostra kopíruje reálné rozložení (zpět → hlavička →
// dvě karty „pas vs soukromé“ → sekce pasu), aby přechod nepřeskakoval. Stejný
// vzor jako prehled/loading.tsx, scoped per-route.
export default function NemovitostDetailLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání nemovitosti…</span>

      {/* Odkaz zpět */}
      <div className="h-4 w-40 rounded bg-surface-2" />

      {/* Hlavička: nadpis + status + meta vlevo, tlačítko „Upravit kontext“ vpravo */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="h-8 w-64 max-w-[60%] rounded-md bg-surface-2" />
            <div className="h-5 w-20 rounded bg-surface-2" />
          </div>
          <div className="mt-2 h-4 w-80 max-w-[85%] rounded bg-surface-2" />
        </div>
        <div className="h-9 w-40 rounded-md bg-surface-2" />
      </div>

      {/* Dvě karty: pas nemovitosti vs soukromá data */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card flex flex-col p-5">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-md bg-surface-2" />
              <div>
                <div className="h-4 w-40 rounded bg-surface-2" />
                <div className="mt-1.5 h-3 w-32 rounded bg-surface-2" />
              </div>
            </div>
            <div className="mt-3 h-12 w-full rounded bg-surface-2" />
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div className="h-16 rounded-md bg-surface-2" />
              <div className="h-16 rounded-md bg-surface-2" />
            </div>
          </div>
        ))}
      </div>

      {/* Sekce pasu */}
      <div>
        <div className="h-5 w-32 rounded bg-surface-2" />
        <div className="mt-2 h-4 w-80 max-w-[80%] rounded bg-surface-2" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-16 p-4" />
          ))}
        </div>
      </div>
    </div>
  );
}
