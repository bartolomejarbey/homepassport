// Server actions for the reminders slice: mark a reminder done or snooze it.
// RLS (reminders_access) gates every write to the user's own household/property.
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

  await sb.from("audit_events").insert({
    actor_id: user.id,
    action: "reminder.done",
    target: { reminder_id: parsed.data },
  });

  revalidatePath("/pripominky");
  revalidatePath("/prehled");
}

/** Re-open a reminder that was marked done (or dismissed) by mistake. */
export async function reopen(formData: FormData): Promise<void> {
  const parsed = idSchema.safeParse(formData.get("reminderId"));
  if (!parsed.success) return;

  const { sb } = await requireUser();

  await sb.from("reminders").update({ status: "open" }).eq("id", parsed.data);

  revalidatePath("/pripominky");
  revalidatePath("/prehled");
}

/**
 * Snooze: push the due date forward by N days and keep the reminder open.
 * If there is no due date yet, snooze from today.
 */
export async function snooze(formData: FormData): Promise<void> {
  const id = idSchema.safeParse(formData.get("reminderId"));
  const days = snoozeSchema.safeParse(formData.get("days"));
  if (!id.success || !days.success) return;

  const { sb } = await requireUser();

  const { data: current } = await sb
    .from("reminders")
    .select("due_date")
    .eq("id", id.data)
    .maybeSingle();

  const base = current?.due_date ? new Date(current.due_date) : new Date();
  // Snooze always moves into the future relative to now.
  const now = new Date();
  const from = base.getTime() > now.getTime() ? base : now;
  from.setDate(from.getDate() + days.data);
  const due = from.toISOString().slice(0, 10);

  await sb
    .from("reminders")
    .update({ due_date: due, status: "open" })
    .eq("id", id.data);

  revalidatePath("/pripominky");
  revalidatePath("/prehled");
}
