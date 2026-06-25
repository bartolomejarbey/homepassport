// Hand-maintained core types (mirror supabase/migrations). For full type-safety
// later: `supabase gen types typescript`. Kept minimal for MVP velocity.
export type WordingType = "legal_required" | "recommended" | "insurance_recommended";
export type UsageContext = "owner_occupied" | "rental" | "svj" | "business";
export type SystemType = "chimney" | "gas" | "electrical" | "lps" | "boiler" | "pv" | "pressure";
export type ExtractionStatus = "draft" | "confirmed" | "rejected";

export interface PropertyContext {
  property_id: string;
  owner_occupied: boolean; rental: boolean; svj: boolean; business_use: boolean;
  has_chimney: boolean; chimney_fuel: string | null;
  has_gas: boolean; has_electrical: boolean; has_lps: boolean; has_pv: boolean;
}
export interface RevisionRule {
  id: string; country: string; property_type: string | null;
  usage_context: UsageContext; system_type: SystemType;
  interval_months: number | null; interval_note: string | null;
  wording_type: WordingType; legal_basis: string | null; message: string;
}
export interface ReminderDraft {
  system_type: SystemType; title: string; wording_type: WordingType;
  legal_basis: string | null; interval_months: number | null; message: string;
}
