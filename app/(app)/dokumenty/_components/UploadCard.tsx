"use client";
// UploadCard — nahraje soubor do privátního bucketu "documents", založí řádek
// documents (scope household) a spustí AI extrakci přes /api/ai/extract.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const CATEGORIES = [
  { value: "invoice", label: "Faktura" },
  { value: "contract", label: "Smlouva" },
  { value: "inspection", label: "Revizní zpráva" },
  { value: "warranty", label: "Záruka" },
  { value: "manual", label: "Návod" },
  { value: "penb", label: "PENB" },
  { value: "insurance", label: "Pojištění" },
  { value: "plan", label: "Plán / výkres" },
  { value: "other", label: "Ostatní" },
] as const;

export function UploadCard({
  householdId,
  propertyId = null,
}: {
  householdId: string;
  propertyId?: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("other");
  // A document tied to a property defaults to transferable (it follows the home on sale).
  const [transferable, setTransferable] = useState(Boolean(propertyId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Vyberte prosím soubor.");
      return;
    }
    setBusy(true);
    try {
      const sb = createClient();
      // Privátní cesta MUSÍ začínat <household_id>/ kvůli Storage RLS.
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${householdId}/${crypto.randomUUID()}-${safeName}`;

      const { error: upErr } = await sb.storage
        .from("documents")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const {
        data: { user },
      } = await sb.auth.getUser();

      const { data: doc, error: insErr } = await sb
        .from("documents")
        .insert({
          household_id: householdId,
          property_id: propertyId,
          category,
          title: file.name,
          file_path: path,
          mime: file.type || null,
          size_bytes: file.size,
          owner_scope: propertyId ? "property" : "household",
          transferable,
          uploaded_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (insErr || !doc) {
        // Záznam se nezaložil — uklidíme osiřelý soubor, ať v úložišti nezůstane viset.
        await sb.storage.from("documents").remove([path]);
        throw new Error(insErr?.message ?? "Nepodařilo se uložit dokument.");
      }

      // Spustit AI extrakci (návrh). Nebrání úspěšnému nahrání — selhání jen logujeme.
      try {
        await fetch("/api/ai/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc.id }),
        });
      } catch {
        // extrakci lze spustit znovu z detailu dokumentu
      }

      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      startTransition(() => {
        router.push(`/dokumenty/${doc.id}`);
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nahrání selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Nahrát dokument</h2>
          <p className="mt-1 text-sm text-muted">
            Soubor uložíme do soukromého úložiště a navrhneme z něj data. Vy je potvrdíte.
          </p>
        </div>

        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-8 text-center transition-colors hover:border-navy/40"
        >
          <UploadCloud size={22} className="text-honey" />
          <span className="text-sm font-medium text-ink-soft">
            {file ? file.name : "Vyberte soubor (PDF nebo obrázek)"}
          </span>
          {file && (
            <span className="text-xs text-muted">
              {(file.size / 1024).toFixed(0)} kB
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Kategorie</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={transferable}
              onChange={(e) => setTransferable(e.target.checked)}
              className="h-4 w-4 rounded border-line text-navy focus:ring-navy/30"
            />
            <span className="text-sm text-ink-soft">
              Patří k nemovitosti (přejde na kupujícího)
            </span>
          </label>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-rust">
            <AlertCircle size={15} /> {error}
          </p>
        )}

        <Button type="submit" variant="honey" disabled={busy || !file} className="w-full sm:w-auto">
          {busy ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Nahrávám…
            </>
          ) : (
            "Nahrát a navrhnout data"
          )}
        </Button>
      </form>
    </Card>
  );
}
