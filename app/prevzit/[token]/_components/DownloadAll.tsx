"use client";

// DownloadAll — spustí stažení všech přenosných dokumentů najednou. Dostává hotové
// podepsané URL (TTL 1 h, generované server-side adminem) — nikdy syrové cesty v
// úložišti. Stahování spouštíme postupně s malou prodlevou, aby je prohlížeč
// nezablokoval jako hromadný popup. Bez JavaScriptu fungují jednotlivé odkazy
// u každého dokumentu jako náhrada.
import { useState } from "react";
import { Download, Check } from "lucide-react";

export function DownloadAll({ urls }: { urls: string[] }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (urls.length === 0) return null;

  async function startAll() {
    if (busy) return;
    setBusy(true);
    setDone(false);
    for (const url of urls) {
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      // Cesta i filename už řeší ?download= v podepsané URL; necháme prohlížeč stáhnout.
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Krátká prodleva, ať prohlížeč stihne každé stažení samostatně.
      await new Promise((r) => setTimeout(r, 350));
    }
    setBusy(false);
    setDone(true);
  }

  return (
    <button
      type="button"
      onClick={startAll}
      disabled={busy}
      className="btn btn-ghost text-sm disabled:opacity-50"
    >
      {done ? <Check size={16} className="text-teal" /> : <Download size={16} />}
      {busy
        ? "Stahuji…"
        : done
          ? "Staženo"
          : `Stáhnout vše (${urls.length})`}
    </button>
  );
}
