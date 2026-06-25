// Client dialog to create a builder-owned property passport. Data entry is kept
// deliberately tiny (type is the only required field) — the pitch is "založte pas,
// nahrajte dokumenty a AI je roztřídí", so on success we route to document upload.
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createOrgProperty } from "./actions";

type PropertyType = "house" | "apartment" | "unit" | "land" | "commercial";

const TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: "apartment", label: "Byt" },
  { value: "house", label: "Rodinný dům" },
  { value: "unit", label: "Jednotka" },
  { value: "commercial", label: "Komerční prostor" },
  { value: "land", label: "Pozemek" },
];

export function CreatePropertyDialog({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Which button triggered submit — set on click, read in the single onSubmit.
  const thenUpload = useRef(false);

  function close() {
    if (!pending) {
      setOpen(false);
      setError(null);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      organization_id: orgId,
      type: String(fd.get("type")) as PropertyType,
      title: String(fd.get("title") ?? ""),
      street: String(fd.get("street") ?? ""),
      city: String(fd.get("city") ?? ""),
      postal_code: String(fd.get("postal_code") ?? ""),
    };
    const upload = thenUpload.current;
    startTransition(async () => {
      const res = await createOrgProperty(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      if (upload) router.push(`/dokumenty?property=${res.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="honey" onClick={() => setOpen(true)}>
        <Plus size={16} />
        Nový pas nemovitosti
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Nový pas nemovitosti"
        >
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">
                  Nový pas nemovitosti
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Stačí typ. Adresu a detaily AI doplní z dokumentů, které nahrajete.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
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
                <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-ink">
                  Typ nemovitosti
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue="apartment"
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
                <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-ink">
                  Označení <span className="text-muted">(nepovinné)</span>
                </label>
                <Input id="title" name="title" type="text" placeholder="Např. Byt B2.04, Rezidence Park" />
              </div>

              <details className="rounded-md border border-line bg-surface-2/60">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-soft">
                  Adresa (nepovinné)
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  <Input name="street" type="text" placeholder="Ulice a číslo" />
                  <div className="grid grid-cols-3 gap-3">
                    <Input name="city" type="text" placeholder="Obec" className="col-span-2" />
                    <Input name="postal_code" type="text" inputMode="numeric" placeholder="PSČ" />
                  </div>
                </div>
              </details>

              <div className="rounded-md border border-honey/40 bg-honey-100/50 px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-medium text-honey-600">
                  <Sparkles size={15} /> Nahrajte dokumenty, AI je roztřídí
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Žádné vyplňování tabulek. Hodíte do pasu PENB, revize, návody a
                  faktury — AI z nich vytvoří strukturovaný pas.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button
                  type="submit"
                  variant="ghost"
                  onClick={() => (thenUpload.current = false)}
                  disabled={pending}
                >
                  Jen založit
                </Button>
                <Button
                  type="submit"
                  variant="honey"
                  onClick={() => (thenUpload.current = true)}
                  disabled={pending}
                >
                  {pending && <Loader2 size={16} className="animate-spin" />}
                  Založit a nahrát dokumenty
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
