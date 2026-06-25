// Client dialog to generate a handover invitation for a property. Posts to
// /api/handover/invite, then shows the shareable /prevzit/[token] link the
// developer sends to the buyer. The token is a one-time claim, not a credential.
"use client";

import { useState } from "react";
import { Send, X, Loader2, AlertCircle, Copy, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Invite = { url: string; buyerEmail: string; expiresAt: string | null };

export function HandoverDialog({
  propertyId,
  propertyLabel,
  hasPendingInvite = false,
}: {
  propertyId: string;
  propertyLabel: string;
  /** A live invite is already out for this property (informational note only). */
  hasPendingInvite?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setOpen(false);
    setError(null);
    setInvite(null);
    setCopied(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const buyerEmail = String(fd.get("buyerEmail") ?? "").trim();
    setBusy(true);
    try {
      const res = await fetch("/api/handover/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, buyerEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Pozvánku se nepodařilo vytvořit.");
        return;
      }
      setInvite({ url: data.url, buyerEmail: data.buyerEmail, expiresAt: data.expiresAt });
    } catch {
      setError("Síťová chyba. Zkuste to prosím znovu.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="text-sm">
        <Send size={15} />
        Předat kupujícímu
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !busy && reset()}
          role="dialog"
          aria-modal="true"
          aria-label="Předat nemovitost kupujícímu"
        >
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">
                  Předat kupujícímu
                </h2>
                <p className="mt-1 text-sm text-ink-soft">{propertyLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => !busy && reset()}
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Zavřít"
              >
                <X size={18} />
              </button>
            </div>

            {invite ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-md border border-teal/30 bg-teal-100/60 px-3 py-2.5">
                  <p className="flex items-center gap-2 text-sm font-medium text-teal">
                    <Check size={15} /> Pozvánka vytvořena
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Odešlete tento odkaz na {invite.buyerEmail}. Kupující jím
                    převezme přenositelnou část pasu.
                  </p>
                </div>

                <div>
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Link2 size={14} className="text-honey-600" /> Sdílecí odkaz
                  </span>
                  <div className="flex items-stretch gap-2">
                    <input
                      readOnly
                      value={invite.url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink-soft outline-none"
                    />
                    <Button type="button" variant="honey" onClick={copy} className="shrink-0">
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? "Zkopírováno" : "Kopírovat"}
                    </Button>
                  </div>
                  {invite.expiresAt && (
                    <p className="mt-1.5 text-xs text-muted">
                      Platnost do {new Date(invite.expiresAt).toLocaleDateString("cs-CZ")}.
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="button" variant="ghost" onClick={reset}>
                    Hotovo
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="mt-5 space-y-4">
                <p className="text-sm text-ink-soft">
                  Vygenerujeme odkaz, kterým kupující převezme dokumenty označené jako
                  přenositelné, kontext nemovitosti i revize. Soukromá data domácnosti
                  se nepředávají.
                </p>

                {hasPendingInvite && (
                  <div className="flex items-start gap-2 rounded-md border border-teal/30 bg-teal-100/60 px-3 py-2 text-sm text-teal">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>
                      Pro tuto nemovitost už máte aktivní odkaz čekající na kupujícího.
                      Nový odkaz vystavíte jen, pokud chcete předat jinému kupujícímu.
                    </span>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-line bg-rust-100 px-3 py-2 text-sm text-rust">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="buyerEmail" className="mb-1.5 block text-sm font-medium text-ink">
                    E-mail kupujícího
                  </label>
                  <Input
                    id="buyerEmail"
                    name="buyerEmail"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="kupujici@email.cz"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => !busy && reset()} disabled={busy}>
                    Zrušit
                  </Button>
                  <Button type="submit" variant="honey" disabled={busy}>
                    {busy && <Loader2 size={16} className="animate-spin" />}
                    Vytvořit odkaz
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
