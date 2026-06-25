// Detail dokumentu — skeleton během načítání. Stránka /dokumenty/[id] čte dokument
// a paralelně podepsanou URL náhledu i seznam AI extrakcí. Bez kostry by se po
// prokliku na chvíli ukázal prázdný <main>. Kostra kopíruje reálné rozložení (zpět →
// hlavička → dvě karty náhled + návrh → karta správy), aby přechod nepřeskakoval.
// Stejný vzor jako prehled/loading.tsx, scoped per-route.
export default function DokumentDetailLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Načítání dokumentu…</span>

      {/* Odkaz zpět */}
      <div className="h-4 w-40 rounded bg-surface-2" />

      {/* Hlavička: název + datum vlevo, štítky vpravo */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="h-8 w-64 max-w-[70%] rounded-md bg-surface-2" />
          <div className="mt-2 h-4 w-40 rounded bg-surface-2" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 rounded bg-surface-2" />
          <div className="h-5 w-20 rounded bg-surface-2" />
        </div>
      </div>

      {/* Dvě karty: náhled + návrh dat */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-0">
            <div className="border-b border-line px-5 py-3">
              <div className="h-5 w-40 rounded bg-surface-2" />
            </div>
            <div className="p-5">
              <div className="h-72 w-full rounded-md bg-surface-2" />
            </div>
          </div>
        ))}
      </div>

      {/* Karta správy dokumentu */}
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="h-5 w-40 rounded bg-surface-2" />
          <div className="mt-1.5 h-4 w-80 max-w-full rounded bg-surface-2" />
        </div>
        <div className="h-9 w-28 rounded-md bg-surface-2" />
      </div>
    </div>
  );
}
