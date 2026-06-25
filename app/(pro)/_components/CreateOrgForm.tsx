// Client form to found an organization (calls the createOrganization server action).
// Shown on the /pro dashboard when the user has no org yet — single field, minimal.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createOrganization } from "./actions";

export function CreateOrgForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = { name: String(fd.get("name") ?? "") };
    startTransition(async () => {
      const res = await createOrganization(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card max-w-xl p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-honey-100">
        <Building2 size={20} className="text-honey-600" />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold text-ink">
        Založte firemní účet
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Pod firmou zakládáte pasy nemovitostí pro vaše projekty. Pas pak jedním
        odkazem předáte kupujícímu — kompletní, bez papírování.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">
            Název firmy
          </label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Např. Novostavby Morava s.r.o."
            autoComplete="organization"
            required
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" variant="honey" disabled={pending}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          Založit firmu
        </Button>
      </form>
    </div>
  );
}
