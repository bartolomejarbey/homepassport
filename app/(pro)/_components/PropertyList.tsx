// Renders a list of org-owned property passports. Each row links to its document
// upload (the primary B2B action — "nahrajte dokumenty, AI roztřídí") and exposes
// the handover dialog to generate a buyer link. Server component; the dialog is the
// only interactive island.
import Link from "next/link";
import { Home, MapPin, UploadCloud, CheckCircle2, Clock } from "lucide-react";
import { HandoverDialog } from "./HandoverDialog";
import {
  type ProProperty,
  TYPE_LABELS,
  STATUS_LABELS,
  propertyName,
  formatAddress,
} from "./propertyMeta";

const STATUS_PILL: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  active: "bg-teal-100 text-teal",
  transferred: "bg-honey-100 text-honey-600",
  archived: "bg-surface-2 text-muted",
};

export function PropertyList({
  properties,
  handedOver,
  pending,
}: {
  properties: ProProperty[];
  /** property_ids that already reached a buyer (accepted invitation). */
  handedOver?: Set<string>;
  /** property_ids with a live invite waiting on the buyer to accept. */
  pending?: Set<string>;
}) {
  return (
    <ul className="space-y-3">
      {properties.map((p) => {
        const address = formatAddress(p);
        const label = propertyName(p);
        const isHandedOver = handedOver?.has(p.id) ?? false;
        const isPending = !isHandedOver && (pending?.has(p.id) ?? false);
        return (
          <li key={p.id}>
            <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-navy">
                <Home size={20} className="text-honey" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-display text-lg font-semibold text-ink">
                    {label}
                  </p>
                  {isHandedOver ? (
                    <span className="badge bg-honey-100 text-honey-600">
                      <CheckCircle2 size={12} /> Předáno kupujícímu
                    </span>
                  ) : (
                    <span
                      className={`badge ${STATUS_PILL[p.status] ?? "bg-surface-2 text-muted"}`}
                    >
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  )}
                  {isPending && (
                    <span className="badge bg-teal-100 text-teal">
                      <Clock size={12} /> Odkaz čeká na kupujícího
                    </span>
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                  <span className="text-muted">{TYPE_LABELS[p.type] ?? "Nemovitost"}</span>
                  {address && (
                    <>
                      <span className="text-line">·</span>
                      <MapPin size={14} className="text-muted" />
                      <span className="truncate">{address}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link
                  href={`/dokumenty?property=${p.id}`}
                  className="btn btn-honey text-sm"
                >
                  <UploadCloud size={15} />
                  Nahrát dokumenty
                </Link>
                {isHandedOver ? (
                  <span className="inline-flex items-center gap-1.5 px-2 text-sm font-medium text-teal">
                    <CheckCircle2 size={15} /> Předáno
                  </span>
                ) : (
                  <HandoverDialog
                    propertyId={p.id}
                    propertyLabel={label}
                    hasPendingInvite={isPending}
                  />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
