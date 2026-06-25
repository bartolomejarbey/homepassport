"use client";
// DeleteAssetButton — dvoukrokové potvrzení (žádné nativní confirm()), které
// odešle server action `action`. První klik odhalí potvrzení, druhý smaže.
// Mazání položky je nevratné, proto vědomé potvrzení.
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

function ConfirmSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" /> Mažu…
        </>
      ) : (
        <>
          <Trash2 size={15} /> Opravdu smazat
        </>
      )}
    </Button>
  );
}

export function DeleteAssetButton({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="text-rust"
      >
        <Trash2 size={15} /> Smazat položku
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="flex items-center gap-1.5 text-sm text-rust">
        <AlertCircle size={15} /> Smazat položku i s fotkou? Tuto akci nelze vrátit.
      </span>
      <form action={action} className="flex items-center gap-2">
        <ConfirmSubmit />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirming(false)}
        >
          Zrušit
        </Button>
      </form>
    </div>
  );
}
