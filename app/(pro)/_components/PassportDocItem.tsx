"use client";
// Jeden řádek dokumentu na firemním pasu. Na rozdíl od statického výpisu umožní
// firmě AI návrh POTVRDIT nebo ODMÍTNOUT (HARD RULE: žádný AI výstup se nepřebírá
// automaticky). Teprve potvrzený návrh se na /prevzit/[token] ukáže kupujícímu jako
// „Klíčová data". U návrhu zobrazíme i confidence a odkaz na zdrojový dokument
// (provenience) — uživatel se rozhoduje informovaně, ne naslepo.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Sparkles,
  Check,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
  Building2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { confirmPassportExtraction, rejectPassportExtraction } from "./actions";

const CATEGORY_LABEL: Record<string, string> = {
  contract: "Smlouva",
  invoice: "Faktura",
  penb: "PENB",
  inspection: "Revizní zpráva",
  manual: "Návod",
  warranty: "Záruka",
  plan: "Plán",
  insurance: "Pojištění",
  other: "Ostatní",
};

export type PassportDocView = {
  id: string;
  title: string | null;
  category: string;
  transferable: boolean;
  created_at: string;
  extraction: {
    id: string;
    status: "draft" | "confirmed" | "rejected";
    confidence: number | null;
    summary: string | null;
  } | null;
  sourceUrl: string | null;
};

export function PassportDocItem({
  doc,
  propertyId,
}: {
  doc: PassportDocView;
  propertyId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ex = doc.extraction;
  const isDraft = ex?.status === "draft";
  const confidencePct =
    ex && ex.confidence != null ? Math.round(Math.max(0, Math.min(1, ex.confidence)) * 100) : null;

  function run(action: "confirm" | "reject") {
    if (!ex) return;
    setError(null);
    startTransition(async () => {
      const res =
        action === "confirm"
          ? await confirmPassportExtraction({ extraction_id: ex.id, property_id: propertyId })
          : await rejectPassportExtraction({ extraction_id: ex.id, property_id: propertyId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2">
          <FileText size={18} className="text-honey" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{doc.title ?? "Bez názvu"}</p>
          <p className="mt-0.5 text-xs text-muted">
            {new Date(doc.created_at).toLocaleDateString("cs-CZ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {doc.transferable && <Badge tone="recommended">K nemovitosti</Badge>}
          {ex?.status === "confirmed" ? (
            <Badge tone="verified">
              <Check size={11} /> Potvrzeno
            </Badge>
          ) : isDraft ? (
            <Badge tone="insurance_recommended">
              <Sparkles size={11} /> Návrh
            </Badge>
          ) : null}
          <Badge tone="draft">{CATEGORY_LABEL[doc.category] ?? doc.category}</Badge>
        </div>
      </div>

      {/* Panel návrhu: gist, confidence, zdroj a akce Potvrdit / Odmítnout */}
      {isDraft && ex && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-honey-600">
              <Sparkles size={13} /> AI návrh dat
            </span>
            {confidencePct != null && (
              <span className="text-xs text-muted">Spolehlivost {confidencePct} %</span>
            )}
            {doc.sourceUrl && (
              <a
                href={doc.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline"
              >
                <ExternalLink size={12} /> Zdrojový dokument
              </a>
            )}
          </div>

          {ex.summary && <p className="mt-1.5 text-sm text-ink-soft">{ex.summary}</p>}

          <p className="mt-1.5 text-xs text-muted">
            Návrh je nezávazný. Potvrďte ho jen, pokud odpovídá zdroji — potvrzená data
            uvidí kupující při převzetí.
          </p>

          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-rust">
              <AlertCircle size={13} /> {error}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("confirm")}
              disabled={pending}
              className="btn btn-honey text-sm"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Potvrdit
            </button>
            <button
              type="button"
              onClick={() => run("reject")}
              disabled={pending}
              className="btn btn-ghost text-sm"
            >
              <X size={14} />
              Odmítnout
            </button>
          </div>
        </div>
      )}

      {/* Potvrzeno: drobné ujištění + odkaz na zdroj, bez akcí */}
      {ex?.status === "confirmed" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
          <span className="flex items-center gap-1.5 text-xs text-teal">
            <Check size={13} /> Data potvrzena — přejdou na kupujícího
          </span>
          {doc.sourceUrl && (
            <a
              href={doc.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline"
            >
              <ExternalLink size={12} /> Zdroj
            </a>
          )}
        </div>
      )}

      {/* Bez AI návrhu (nepodařilo se vytvořit) — aspoň náhled zdroje */}
      {!ex && doc.sourceUrl && (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <Building2 size={13} className="text-muted" />
          <a
            href={doc.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline"
          >
            <ExternalLink size={12} /> Otevřít dokument
          </a>
        </div>
      )}
    </Card>
  );
}
