"use client";
// PhotoCapture — vyfotí/nahraje předmět do privátního bucketu "assets", zavolá
// /api/ai/recognize a předvyplní NÁVRH položky (name/category/brand) s confidence.
// Uživatel hodnoty zkontroluje a potvrzením založí řádek assets (source 'photo')
// + asset_photos. Žádné auto-uložení bez potvrzení.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Loader2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

const CATEGORIES = [
  "Spotřebič",
  "Elektronika",
  "Nábytek",
  "Nářadí",
  "Kuchyně",
  "Vytápění",
  "Zahrada",
  "Ostatní",
] as const;

type Guess = {
  name?: string;
  category?: string;
  brand?: string;
  model?: string;
  confidence?: number;
};

// Nízká spolehlivost AI návrhu není „nebezpečí" ani zákonná povinnost — proto
// nikdy červený (legal_required) tón. Jen neutrální / teplý odstín dle jistoty.
function confidenceTone(c: number | null) {
  if (c === null) return "draft" as const;
  if (c >= 0.8) return "verified" as const;
  if (c >= 0.5) return "insurance_recommended" as const;
  return "draft" as const;
}

function fmtConfidence(c: number | null) {
  if (c === null || Number.isNaN(c)) return "neuvedeno";
  return `${Math.round(c * 100)} %`;
}

export function PhotoCapture({
  householdId,
  propertyId,
}: {
  householdId: string;
  propertyId: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Po úspěšném nahrání + rozpoznání: cesta k fotce a předvyplněný NÁVRH formuláře.
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Spotřebič");
  const [brand, setBrand] = useState("");
  const [room, setRoom] = useState("");

  function reset() {
    setPhotoPath(null);
    setConfidence(null);
    setName("");
    setCategory("Spotřebič");
    setBrand("");
    setRoom("");
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));

    try {
      const sb = createClient();
      // Cesta MUSÍ začínat <household_id>/ kvůli Storage RLS.
      const safeName = file.name.replace(/[^\w.\-]+/g, "_") || "foto.jpg";
      const path = `${householdId}/${crypto.randomUUID()}-${safeName}`;

      const { error: upErr } = await sb.storage
        .from("assets")
        .upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);

      setPhotoPath(path);

      // Spustit AI rozpoznání (návrh). Selhání nebrání ručnímu vyplnění.
      try {
        const res = await fetch("/api/ai/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        if (res.ok) {
          const { guess } = (await res.json()) as { guess: Guess };
          setName(guess?.name ?? "");
          if (guess?.category) setCategory(guess.category);
          setBrand(guess?.brand ?? "");
          setConfidence(
            typeof guess?.confidence === "number" ? guess.confidence : null,
          );
        }
      } catch {
        // návrh se nepodařil — uživatel vyplní ručně
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nahrání fotky selhalo.");
      setPhotoPath(null);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Doplňte prosím název položky.");
      return;
    }
    if (!photoPath) {
      setError("Nejprve nahrajte fotku.");
      return;
    }
    setBusy(true);
    try {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();

      // Potvrzený NÁVRH → řádek assets se zdrojem 'photo'.
      const { data: asset, error: insErr } = await sb
        .from("assets")
        .insert({
          household_id: householdId,
          property_id: propertyId,
          name: name.trim(),
          category: category || null,
          brand: brand.trim() || null,
          room: room.trim() || null,
          source: "photo",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (insErr || !asset)
        throw new Error(insErr?.message ?? "Položku se nepodařilo uložit.");

      // Připojit nahranou fotku k položce.
      await sb
        .from("asset_photos")
        .insert({ asset_id: asset.id, file_path: photoPath });

      reset();
      startTransition(() => {
        router.push(`/majetek/${asset.id}`);
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uložení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Camera size={16} className="text-honey" /> Přidat fotkou
          </h2>
          <p className="mt-1 text-sm text-muted">
            Vyfoťte spotřebič nebo vybavení — z fotky navrhneme název a kategorii.
            Vy je potvrdíte.
          </p>
        </div>

        {!photoPath ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-8 text-center transition-colors hover:border-navy/40">
            {busy ? (
              <Loader2 size={22} className="animate-spin text-honey" />
            ) : (
              <Camera size={22} className="text-honey" />
            )}
            <span className="text-sm font-medium text-ink-soft">
              {busy ? "Nahrávám a rozpoznávám…" : "Vyfotit nebo vybrat fotku"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={onPick}
            />
          </label>
        ) : (
          <form onSubmit={onConfirm} className="space-y-4">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Náhled fotky"
                className="max-h-56 w-full rounded-md border border-line object-contain bg-surface-2"
              />
            )}

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                <Sparkles size={14} className="text-honey" /> Návrh z fotky
              </span>
              <Badge tone={confidenceTone(confidence)}>
                Spolehlivost {fmtConfidence(confidence)}
              </Badge>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">
                Název
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Pračka Bosch"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">
                  Kategorie
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
                >
                  {(CATEGORIES.includes(category as (typeof CATEGORIES)[number])
                    ? CATEGORIES
                    : [category, ...CATEGORIES]
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">
                  Značka
                </span>
                <Input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="např. Bosch"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">
                Místnost
              </span>
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="např. Koupelna"
              />
            </label>

            <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
              Toto je automatický návrh z fotky. Zkontrolujte hodnoty a potvrzením
              položku uložte do evidence.
            </p>

            {error && (
              <p className="flex items-center gap-2 text-sm text-rust">
                <AlertCircle size={15} /> {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Ukládám…
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} /> Potvrdit a uložit
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={reset}
              >
                <RotateCcw size={15} /> Začít znovu
              </Button>
            </div>
          </form>
        )}

        {!photoPath && error && (
          <p className="flex items-center gap-2 text-sm text-rust">
            <AlertCircle size={15} /> {error}
          </p>
        )}
      </div>
    </Card>
  );
}
