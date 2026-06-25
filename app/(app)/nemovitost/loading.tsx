// Nemovitosti — skeleton během načítání seznamu nemovitostí. Stránka /nemovitost
// čte členství domácnosti a přes join na property_owners seznam pasů nemovitostí.
// Bez kostry by se po prokliku na chvíli ukázal prázdný <main>. Kostra kopíruje
// reálné rozložení (hlavička s tlačítkem → seznam karet nemovitostí), aby přechod
// nepřeskakoval. Stejný vzor jako prehled/loading.tsx, scoped per-route.
export default function NemovitostiLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání nemovitostí…</span>

      {/* Hlavička: štítek + nadpis + podtitulek vlevo, tlačítko „Založit“ vpravo */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-3.5 w-24 rounded bg-surface-2" />
          <div className="mt-2 h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-96 max-w-[90%] rounded bg-surface-2" />
        </div>
        <div className="h-9 w-44 rounded-md bg-surface-2" />
      </div>

      {/* Seznam karet nemovitostí */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-4 p-5">
            <div className="h-11 w-11 shrink-0 rounded-md bg-surface-2" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="h-5 w-52 max-w-[60%] rounded bg-surface-2" />
                <div className="h-5 w-20 rounded bg-surface-2" />
              </div>
              <div className="mt-1.5 h-4 w-72 max-w-[80%] rounded bg-surface-2" />
            </div>
            <div className="h-4 w-4 shrink-0 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
