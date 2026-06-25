// Připomínky — skeleton během načítání hubu revizí. Stránka /pripominky čte
// členství domácnosti, nemovitost, její kontext a seznam připomínek (řazený podle
// znění a termínu). Bez kostry by se po prokliku na chvíli ukázal prázdný <main>.
// Kostra kopíruje reálné rozložení (hlavička s akcí → legenda štítků → sekce
// otevřených připomínek), aby přechod nepřeskakoval. Stejný vzor jako
// prehled/loading.tsx, scoped per-route.
export default function PripominkyLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání připomínek…</span>

      {/* Hlavička: štítek + nadpis + podtitulek vlevo, tlačítko „Spočítat revize“ vpravo */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="h-3.5 w-24 rounded bg-surface-2" />
          <div className="mt-2 h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-96 max-w-[90%] rounded bg-surface-2" />
        </div>
        <div className="h-9 w-40 rounded-md bg-surface-2" />
      </div>

      {/* Legenda štítků */}
      <div className="card bg-surface-2/60">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-5 w-44 rounded bg-surface-2" />
          ))}
        </div>
      </div>

      {/* Sekce „Otevřené“ — nadpis + několik karet připomínek */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-surface-2" />
          <div className="h-5 w-28 rounded bg-surface-2" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="h-5 w-56 max-w-[60%] rounded bg-surface-2" />
                <div className="h-5 w-28 shrink-0 rounded bg-surface-2" />
              </div>
              <div className="h-3.5 w-40 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
