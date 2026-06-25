"use client";
// Tlačítko pro smazání dokumentu. Server action běží jen po potvrzení v prohlížeči,
// aby nedošlo k nechtěnému smazání (mazání je nevratné — soubor i data zmizí).
import { useRef, useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function DeleteDocumentButton({
  documentId,
  action,
}: {
  documentId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Opravdu smazat tento dokument? Soubor i navržená data se nevratně odstraní.",
          )
        ) {
          e.preventDefault();
          return;
        }
        setBusy(true);
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <Button type="submit" variant="ghost" disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Mažu…
          </>
        ) : (
          <>
            <Trash2 size={15} /> Smazat dokument
          </>
        )}
      </Button>
    </form>
  );
}
