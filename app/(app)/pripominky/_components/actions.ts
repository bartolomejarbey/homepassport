// Server actions for the reminders slice: mark a reminder done or snooze it.
// RLS (reminders_access) gates every write to the user's own household/property.
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const idSchema = z.string().uuid();

// Snooze options in days, surfaced as a small select in the UI.
const snoozeSchema = z.coerce.number().int().min(1).max(365);

// Bound directly to <form action> — must return void (React's form-action type).
// On invalid input we simply no-op; the form re-renders the unchanged reminder.
async function requireUser() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/prihlaseni");
  return { sb, user };
}

/** Mark a reminder as done. Honest copy stays in the row; we only flip status. */
export async function markDone(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formData.get("reminderId"));
  if (!parsed.success) return;

  const { sb, user } = await requireUser();

  // RLS ensures we can only touch reminders we own.
  await sb.from("reminders").update({ status: "done" }).eq("id", parsed.data);

  // audit_events has only a SELECT policy — writes go through the service role,
  // otherwise RLS silently drops them and the trail is lost.
  await createAdminClient().from("audit_events").insert({
    actor_id: user.id,
    action: "reminder.done",
    target: { reminder_id: parsed.data },
  });

  revalidatePath("/pripominky");
  revalidatePath("/prehled");
}

/**
 * Re-open a reminder that the user marked done by mistake.
 * Only acts on status 'done'. 'dismissed' reminders were retired by the engine
 * when the property context changed (supersession) — re-opening them would put
 * stale, contradictory wording next to the current one, so we deliberately skip
 * them here as well as in the UI. The .eq("status","done") guard keeps the
 * server action honest even if it is invoked outside the rendered form.
 */
export async function reopen(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formData.get("reminderId"));
  if (!parsed.success) return;

  const { sb, user } = await requireUser();

  const { data: updated } = await sb
    .from("reminders")
    .update({ status: "open" })
    .eq("id", parsed.data)
    .eq("status", "done")
    .select("id");

  // Nothing flipped (e.g. a superseded reminder) → no state change, no audit row.
  if (!updated || updated.length === 0) return;

  await createAdminClient().from("audit_events").insert({
    actor_id: user.id,
    action: "reminder.reopened",
    target: { reminder_id: parsed.data },
  });

  revalidatePath("/pripominky");
  revalidatePath("/prehled");
}

/**
 * Snooze: push the due date forward by N days and mark the reminder as snoozed.
 * If there is no due date yet, snooze from today. We use the 'snoozed' status
 * (not 'open') so the rest of the app — which counts open+snoozed together —
 * still shows it, while the card can honestly label it as deferred.
 */
export async function snooze(formData: FormData): Promise<void> {
  const id = idSchema.safeParse(formData.get("reminderId"));
  const days = snoozeSchema.safeParse(formData.get("days"));
  if (!id.success || !days.success) return;

  const { sb, user } = await requireUser();

  const { data: current } = await sb
    .from("reminders")
    .select("due_date")
    .eq("id", id.data)
    .maybeSingle();

  // Počítáme v celých kalendářních dnech a lokálním čase. due_date je 'YYYY-MM-DD';
  // new Date(string) by ho vzal jako UTC a v ČR posunul o den — proto parsujeme
  // i formátujeme lokálně, ať uložený termín přesně sedí s tím, co uvidí uživatel.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Defensive copy: base.setDate() below mutates in place, so never alias `today`.
  let base = new Date(today);
  if (current?.due_date) {
    const [y, m, d] = current.due_date.split("-").map(Number);
    const parsed = new Date(y, (m ?? 1) - 1, d ?? 1);
    // Snooze always moves into the future relative to today.
    if (parsed.getTime() > today.getTime()) base = parsed;
  }
  base.setDate(base.getDate() + days.data);
  const pad = (n: number) => String(n).padStart(2, "0");
  const due = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;

  await sb
    .from("reminders")
    .update({ due_date: due, status: "snoozed" })
    .eq("id", id.data);

  await createAdminClient().from("audit_events").insert({
    actor_id: user.id,
    action: "reminder.snoozed",
    target: { reminder_id: id.data, days: days.data, due_date: due },
  });

  revalidatePath("/pripominky");
  revalidatePath("/prehled");
}
