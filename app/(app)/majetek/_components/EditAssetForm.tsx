"use client";
// EditAssetForm — úprava údajů položky majetku přes server action. Umožní opravit
// AI návrh z fotky a doplnit pole, která rozpoznání nezná: sériové číslo, datum
// a cenu pořízení, záruku. Datum pořízení navíc zpřesní pozdější odhad hodnoty
// (počítá se z něj stáří). Formulář je sbalený za tlačítkem „Upravit údaje".
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Loader2, Check, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

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

export type AssetEditValues = {
  name: string;
  category: string | null;
  room: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  warranty_until: string | null;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" /> Ukládám…
        </>
      ) : (
        <>
          <Check size={15} /> Uložit změny
        </>
      )}
    </Button>
  );
}

export function EditAssetForm({
  action,
  values,
}: {
  action: (formData: FormData) => void | Promise<void>;
  values: AssetEditValues;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil size={15} /> Upravit údaje
      </Button>
    );
  }

  const cat = values.category ?? "";
  const catOptions = cat && !CATEGORIES.includes(cat as (typeof CATEGORIES)[number])
    ? [cat, ...CATEGORIES]
    : CATEGORIES;

  return (
    <form
      action={action}
      className="space-y-4 rounded-md border border-line bg-surface-2 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Pencil size={14} className="text-honey" /> Upravit údaje položky
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted transition-colors hover:text-ink"
          aria-label="Zavřít úpravu"
        >
          <X size={16} />
        </button>
      </div>

      <Field label="Název">
        <Input name="name" defaultValue={values.name} required maxLength={200} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Kategorie">
          <select
            name="category"
            defaultValue={cat}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
          >
            <option value="">Bez kategorie</option>
            {catOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Místnost">
          <Input
            name="room"
            defaultValue={values.room ?? ""}
            placeholder="např. Koupelna"
            maxLength={120}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Značka">
          <Input
            name="brand"
            defaultValue={values.brand ?? ""}
            placeholder="např. Bosch"
            maxLength={120}
          />
        </Field>
        <Field label="Model">
          <Input
            name="model"
            defaultValue={values.model ?? ""}
            placeholder="např. WAN28160"
            maxLength={120}
          />
        </Field>
      </div>

      <Field label="Sériové číslo">
        <Input
          name="serial"
          defaultValue={values.serial ?? ""}
          placeholder="nepovinné"
          maxLength={120}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Datum pořízení">
          <Input
            name="purchase_date"
            type="date"
            defaultValue={values.purchase_date ?? ""}
          />
        </Field>
        <Field label="Pořizovací cena (Kč)">
          <Input
            name="purchase_price"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={
              values.purchase_price != null ? String(values.purchase_price) : ""
            }
            placeholder="např. 12000"
          />
        </Field>
      </div>

      <Field label="Záruka do">
        <Input
          name="warranty_until"
          type="date"
          defaultValue={values.warranty_until ?? ""}
        />
      </Field>

      <p className="flex items-start gap-2 rounded-md bg-surface px-3 py-2 text-xs text-muted">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        Datum pořízení pomůže přesnějšímu odhadu hodnoty — počítá se z něj stáří
        věci.
      </p>

      <div className="flex flex-wrap gap-2">
        <SaveButton />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Zrušit
        </Button>
      </div>
    </form>
  );
}
