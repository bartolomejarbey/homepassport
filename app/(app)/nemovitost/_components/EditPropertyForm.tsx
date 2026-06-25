// Inline "Upravit údaje" form on the property detail — edits the passport's own
// identity fields (název, typ, adresa, LV, stav) after founding. Collapsed behind a
// button to keep the detail calm; expands in place. Backs onto the updateProperty
// server action (RLS-gated to owners). No separate route needed — matches the
// inline-edit pattern used by majetek's EditAssetForm.
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SlidersHorizontal,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PropertyType } from "./PropertyMeta";
import { updateProperty } from "./actions";

const TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: "house", label: "Rodinný dům" },
  { value: "apartment", label: "Byt" },
  { value: "unit", label: "Jednotka" },
  { value: "land", label: "Pozemek" },
  { value: "commercial", label: "Komerční prostor" },
];

// 'transferred' is intentionally absent — it is set only by a completed handover,
// never by hand, so the manual control offers just the states an owner may choose.
const STATUS_OPTIONS: { value: "draft" | "active" | "archived"; label: string }[] = [
  { value: "draft", label: "Rozpracováno" },
  { value: "active", label: "Aktivní" },
  { value: "archived", label: "Archivováno" },
];

export type EditableProperty = {
  id: string;
  type: string;
  title: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  cadastral_id: string | null;
  status: string;
};

export function EditPropertyForm({ property }: { property: EditableProperty }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    const payload = {
      id: property.id,
      type: String(fd.get("type")) as PropertyType,
      title: String(fd.get("title") ?? ""),
      street: String(fd.get("street") ?? ""),
      city: String(fd.get("city") ?? ""),
      postal_code: String(fd.get("postal_code") ?? ""),
      cadastral_id: String(fd.get("cadastral_id") ?? ""),
      status: String(fd.get("status")) as "draft" | "active" | "archived",
    };
    startTransition(async () => {
      const res = await updateProperty(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => setOpen(true)}>
          <SlidersHorizontal size={16} />
          Upravit údaje
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-teal">
            <CheckCircle2 size={16} />
            Uloženo
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card w-full max-w-xl space-y-4 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">
            Údaje nemovitosti
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Název, typ, adresa i číslo listu vlastnictví. Změny se projeví v pasu.
          </p>
        </div>
        <button
          type="button"
          onClick={() => !pending && setOpen(false)}
          className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Zavřít"
        >
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="edit-type"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            Typ nemovitosti
          </label>
          <select
            ref={firstFieldRef}
            id="edit-type"
            name="type"
            defaultValue={property.type}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="edit-status"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            Stav
          </label>
          <select
            id="edit-status"
            name="status"
            defaultValue={
              property.status === "transferred" ? "active" : property.status
            }
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="edit-title"
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Název <span className="text-muted">(nepovinné)</span>
        </label>
        <Input
          id="edit-title"
          name="title"
          type="text"
          defaultValue={property.title ?? ""}
          placeholder="Např. Chalupa na Vysočině"
        />
      </div>

      <div>
        <label
          htmlFor="edit-street"
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Ulice a číslo <span className="text-muted">(nepovinné)</span>
        </label>
        <Input
          id="edit-street"
          name="street"
          type="text"
          defaultValue={property.street ?? ""}
          placeholder="Dlouhá 12"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label
            htmlFor="edit-city"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            Obec
          </label>
          <Input
            id="edit-city"
            name="city"
            type="text"
            defaultValue={property.city ?? ""}
            placeholder="Praha"
          />
        </div>
        <div>
          <label
            htmlFor="edit-postal"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            PSČ
          </label>
          <Input
            id="edit-postal"
            name="postal_code"
            type="text"
            inputMode="numeric"
            defaultValue={property.postal_code ?? ""}
            placeholder="110 00"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="edit-cadastral"
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Číslo LV <span className="text-muted">(list vlastnictví, nepovinné)</span>
        </label>
        <Input
          id="edit-cadastral"
          name="cadastral_id"
          type="text"
          defaultValue={property.cadastral_id ?? ""}
          placeholder="Např. 1234"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Zrušit
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          Uložit změny
        </Button>
      </div>
    </form>
  );
}
