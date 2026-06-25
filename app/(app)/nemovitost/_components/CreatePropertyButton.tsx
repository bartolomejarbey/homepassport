// Client dialog to found a new property (calls the createProperty server action).
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createProperty } from "./actions";

type PropertyType = "house" | "apartment" | "unit" | "land" | "commercial";

const TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: "house", label: "Rodinný dům" },
  { value: "apartment", label: "Byt" },
  { value: "unit", label: "Jednotka" },
  { value: "land", label: "Pozemek" },
  { value: "commercial", label: "Komerční prostor" },
];

export function CreatePropertyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      type: String(fd.get("type")) as PropertyType,
      title: String(fd.get("title") ?? ""),
      street: String(fd.get("street") ?? ""),
      city: String(fd.get("city") ?? ""),
      postal_code: String(fd.get("postal_code") ?? ""),
    };
    startTransition(async () => {
      const res = await createProperty(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/nemovitost/${res.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={16} />
        Založit nemovitost
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !pending && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Založit nemovitost"
        >
          <div
            className="card w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">
                  Založit nemovitost
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Adresu i detaily můžete doplnit kdykoliv později.
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

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="type"
                  className="mb-1.5 block text-sm font-medium text-ink"
                >
                  Typ nemovitosti
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue="house"
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
                  htmlFor="title"
                  className="mb-1.5 block text-sm font-medium text-ink"
                >
                  Název <span className="text-muted">(nepovinné)</span>
                </label>
                <Input
                  id="title"
                  name="title"
                  type="text"
                  placeholder="Např. Chalupa na Vysočině"
                />
              </div>

              <div>
                <label
                  htmlFor="street"
                  className="mb-1.5 block text-sm font-medium text-ink"
                >
                  Ulice a číslo <span className="text-muted">(nepovinné)</span>
                </label>
                <Input
                  id="street"
                  name="street"
                  type="text"
                  placeholder="Dlouhá 12"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label
                    htmlFor="city"
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    Obec
                  </label>
                  <Input id="city" name="city" type="text" placeholder="Praha" />
                </div>
                <div>
                  <label
                    htmlFor="postal_code"
                    className="mb-1.5 block text-sm font-medium text-ink"
                  >
                    PSČ
                  </label>
                  <Input
                    id="postal_code"
                    name="postal_code"
                    type="text"
                    inputMode="numeric"
                    placeholder="110 00"
                  />
                </div>
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
                  Založit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
