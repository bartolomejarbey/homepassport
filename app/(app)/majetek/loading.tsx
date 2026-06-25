// Majetek — skeleton během načítání inventáře. Stránka /majetek čte členství
// domácnosti, případnou nemovitost a seznam položek (řazený podle místností).
// Bez kostry by se po prokliku na chvíli ukázal prázdný <main>. Kostra kopíruje
// reálné rozložení (hlavička → souhrn hodnoty + skupiny položek + karta fotky),
// aby přechod nepřeskakoval. Stejný vzor jako prehled/loading.tsx, scoped per-route.
export default function MajetekLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání majetku…</span>

      {/* Hlavička */}
      <div>
        <div className="h-3.5 w-20 rounded bg-surface-2" />
        <div className="mt-2 h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
        <div className="mt-2 h-4 w-96 max-w-[90%] rounded bg-surface-2" />
      </div>

      {/* Dvě sloupce: souhrn + skupiny položek vlevo, karta fotky vpravo. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="order-2 space-y-6 lg:order-1">
          {/* Souhrn odhadované hodnoty */}
          <div className="card flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="h-4 w-48 rounded bg-surface-2" />
              <div className="mt-2 h-8 w-40 rounded-md bg-surface-2" />
            </div>
            <div className="h-8 w-56 max-w-full rounded bg-surface-2" />
          </div>

          {/* Dvě skupiny po dvou položkách */}
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="h-5 w-32 rounded bg-surface-2" />
                <div className="h-3 w-16 rounded bg-surface-2" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="card flex items-center gap-4 p-4">
                    <div className="h-10 w-10 shrink-0 rounded-md bg-surface-2" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-44 max-w-[70%] rounded bg-surface-2" />
                      <div className="mt-1.5 h-3 w-28 rounded bg-surface-2" />
                    </div>
                    <div className="h-5 w-20 shrink-0 rounded bg-surface-2" />
                  </div>
                ))}
              </div>
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
