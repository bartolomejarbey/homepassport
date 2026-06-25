// Majetek (Home OS) — inventář položek seskupený podle místností, s celkovou
// odhadovanou hodnotou. Vpravo PhotoCapture pro přidání položky fotkou.
import Link from "next/link";
import { ChevronRight, Package, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PhotoCapture } from "./_components/PhotoCapture";

export const metadata = { title: "Majetek — Home Passport" };

type AssetRow = {
  id: string;
  name: string;
  category: string | null;
  room: string | null;
  brand: string | null;
  estimated_value: number | null;
  estimated_value_confidence: number | null;
  source: string;
};

function fmtCzk(n: number | null) {
  if (n === null || Number.isNaN(n)) return null;
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function MajetekPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const { data: membership } = await sb
    .from("household_members")
    .select("household_id")
    .eq("user_id", user!.id)
    .limit(1)
    .maybeSingle();

  const householdId = membership?.household_id ?? null;

  // Případná nemovitost domácnosti — položky k ní volitelně přivěsíme.
  let propertyId: string | null = null;
  let assets: AssetRow[] = [];

  if (householdId) {
    const [{ data: owner }, { data }] = await Promise.all([
      sb
        .from("property_owners")
        .select("property_id")
        .eq("household_id", householdId)
        .limit(1)
        .maybeSingle(),
      sb
        .from("assets")
        .select(
          "id, name, category, room, brand, estimated_value, estimated_value_confidence, source",
        )
        .eq("household_id", householdId)
        .order("room", { ascending: true })
        .order("created_at", { ascending: false }),
    ]);
    propertyId = owner?.property_id ?? null;
    assets = (data as AssetRow[] | null) ?? [];
  }

  // Seskupit podle místnosti (bez místnosti → "Bez zařazení").
  const groups = new Map<string, AssetRow[]>();
  for (const a of assets) {
    const key = a.room?.trim() || "Bez zařazení";
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }
  const groupedRooms = Array.from(groups.entries()).sort(([a], [b]) =>
    a.localeCompare(b, "cs"),
  );

  const total = assets.reduce((sum, a) => sum + (a.estimated_value ?? 0), 0);
  const valuedCount = assets.filter((a) => a.estimated_value != null).length;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">Majetek</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
          Váš domácí inventář
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Spotřebiče a vybavení domácnosti na jednom místě. Přidávejte je fotkou —
          z fotky navrhneme název i kategorii.
        </p>
      </header>

      {!householdId ? (
        <Card className="border-honey/40 bg-honey-100/40">
          <p className="font-display text-base text-ink">
            Zatím nemáte založenou domácnost
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Domácnost vzniká automaticky po registraci. Pokud ji nevidíte, zkuste
            se odhlásit a znovu přihlásit.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <section className="order-2 space-y-6 lg:order-1">
            {assets.length === 0 ? (
              <EmptyState
                title="Zatím žádné položky"
                hint="Přidejte první spotřebič — vyfoťte ho vpravo a my navrhneme název a kategorii."
              />
            ) : (
              <>
                {/* Souhrn odhadované hodnoty */}
                <Card className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink-soft">
                      Odhadovaná hodnota inventáře
                    </p>
                    <p className="mt-1 font-display text-3xl font-semibold text-ink">
                      {fmtCzk(total) ?? "0 Kč"}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    Hrubý odhad z {valuedCount} z {assets.length}{" "}
                    {assets.length === 1 ? "položky" : "položek"}. Pouze
                    orientační.
                  </p>
                </Card>

                {/* Skupiny podle místností */}
                {groupedRooms.map(([room, items]) => {
                  const roomTotal = items.reduce(
                    (s, a) => s + (a.estimated_value ?? 0),
                    0,
                  );
                  return (
                    <div key={room}>
                      <div className="mb-2 flex items-baseline justify-between">
                        <h2 className="font-display text-lg font-semibold text-ink">
                          {room}
                        </h2>
                        {roomTotal > 0 && (
                          <span className="text-xs text-muted">
                            {fmtCzk(roomTotal)}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {items.map((a) => {
                          const value = fmtCzk(a.estimated_value);
                          return (
                            <li key={a.id}>
                              <Link href={`/majetek/${a.id}`} className="block">
                                <Card className="flex items-center gap-4 p-4 transition-colors hover:border-navy/30">
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2">
                                    <Package size={18} className="text-honey" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-ink">
                                      {a.name}
                                    </p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                      {a.category && <span>{a.category}</span>}
                                      {a.brand && (
                                        <>
                                          <span className="text-line">·</span>
                                          <span>{a.brand}</span>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {a.source === "photo" && (
                                      <Badge tone="insurance_recommended">
                                        <Sparkles size={11} /> Z fotky
                                      </Badge>
                                    )}
                                    {value ? (
                                      <span className="text-sm font-medium text-ink">
                                        {value}
                                      </span>
                                    ) : (
                                      <Badge tone="draft">Bez odhadu</Badge>
                                    )}
                                    <ChevronRight
                                      size={16}
                                      className="text-muted"
                                    />
                                  </div>
                                </Card>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}
          </section>

          <aside className="order-1 lg:order-2">
            <PhotoCapture householdId={householdId} propertyId={propertyId} />
          </aside>
        </div>
      )}
    </div>
  );
}
