// /pro/nemovitosti — skeleton během načítání seznamu firemních pasů. Stránka čte
// organizaci uživatele, její pasy nemovitostí a statistiky předání. Bez kostry by
// se po prokliku na chvíli ukázal prázdný <main>. Kostra kopíruje reálné rozložení
// (hlavička s akcí → seznam karet nemovitostí), aby přechod nepřeskakoval.
// Stejný vzor jako prehled/loading.tsx, scoped per-route.
export default function ProPropertiesLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání nemovitostí…</span>

      {/* Hlavička: název firmy + nadpis + podtitulek vlevo, tlačítko „Nový pas“ vpravo */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-3.5 w-32 rounded bg-surface-2" />
          <div className="mt-2 h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-96 max-w-[90%] rounded bg-surface-2" />
        </div>
        <div className="h-9 w-40 rounded-md bg-surface-2" />
      </div>

      {/* Seznam karet nemovitostí (mirror PropertyList) */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
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
