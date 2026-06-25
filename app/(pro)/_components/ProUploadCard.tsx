"use client";
// ProUploadCard — nahrání dokumentu na firemní pas nemovitosti. Na rozdíl od
// spotřebitelské UploadCard (úložiště přes RLS klienta) NEMŮŽE org nahrávat přímo
// do Storage — Storage RLS (storage_household_ok) vyžaduje household v cestě, který
// firemní pas nemá. Soubor proto pošleme jako base64 do server action
// uploadOrgDocument, která ho uloží přes service role a spustí AI návrh.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { uploadOrgDocument } from "./actions";

const CATEGORIES = [
  { value: "penb", label: "PENB" },
  { value: "inspection", label: "Revizní zpráva" },
  { value: "plan", label: "Plán / výkres" },
  { value: "contract", label: "Smlouva" },
  { value: "manual", label: "Návod" },
  { value: "warranty", label: "Záruka" },
  { value: "invoice", label: "Faktura" },
  { value: "insurance", label: "Pojištění" },
  { value: "other", label: "Ostatní" },
] as const;

const MAX_BYTES = 25 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? "");
      // "data:<mime>;base64,<payload>" → jen payload
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(new Error("Soubor se nepodařilo načíst."));
    reader.readAsDataURL(file);
  });
}

export function ProUploadCard({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("penb");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!file) {
      setError("Vyberte prosím soubor.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Soubor je příliš velký (max 25 MB).");
      return;
    }
    setBusy(true);
    try {
      const data_base64 = await fileToBase64(file);
      const res = await uploadOrgDocument({
        property_id: propertyId,
        category,
        filename: file.name,
        mime: file.type || undefined,
        size_bytes: file.size,
        data_base64,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(
        res.extracted
          ? "Dokument nahrán. AI z něj připravila návrh dat k potvrzení."
          : "Dokument nahrán. AI návrh se nepodařilo vytvořit — zkuste to později.",
      );
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      startTransition(() => router.refresh());
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
            Hoďte sem PENB, revizní zprávu nebo projekt. AI z dokumentu navrhne data —
            vy je potvrdíte.
          </p>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-8 text-center transition-colors hover:border-navy/40">
          <UploadCloud size={22} className="text-honey" />
          <span className="text-sm font-medium text-ink-soft">
            {file ? file.name : "Vyberte soubor (PDF nebo obrázek)"}
          </span>
          {file && <span className="text-xs text-muted">{(file.size / 1024).toFixed(0)} kB</span>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
              setNotice(null);
            }}
          />
        </label>

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

        <div className="flex items-start gap-2 rounded-md border border-honey/40 bg-honey-100/50 px-3 py-2.5">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-honey-600" />
          <p className="text-xs text-ink-soft">
            Dokument se uloží jako přenositelný — při předání pasu přejde na kupujícího.
            AI návrh je vždy jen návrh; nic se nepotvrzuje automaticky.
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-rust">
            <AlertCircle size={15} /> {error}
          </p>
        )}
        {notice && <p className="text-sm text-teal">{notice}</p>}

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
