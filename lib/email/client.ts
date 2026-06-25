import "server-only";
import { Resend } from "resend";
import {
  handoverInvitation,
  type HandoverInvitationInput,
} from "./templates/handover-invitation";

// Thin, fail-soft wrapper around Resend for transactional e-mail.
//
// DESIGN: e-mail is ALWAYS best-effort here. Sending a handover invite must never
// be able to fail the invite itself (the API still returns the shareable link), so
// every path in this module returns a small result object instead of throwing:
//   - no RESEND_API_KEY        → no-op, { ok:false, skipped:true }   (dev/CI safe)
//   - Resend returns an error  → logged, { ok:false, error }
//   - send throws (network…)   → caught, logged, { ok:false, error }
//   - success                  → { ok:true, id }
// Callers can branch on `ok` for an `emailed` flag but never need a try/catch.
//
// GDPR: only used for TRANSACTIONAL mail (handover invitations). No marketing.

export interface SendResult {
  ok: boolean;
  // true when we deliberately did nothing because no API key is configured.
  skipped?: boolean;
  // Resend message id on success.
  id?: string;
  // Human-readable reason on failure (never the raw key/PII).
  error?: string;
}

// Default From. Resend requires a verified domain; the address is configurable via
// EMAIL_FROM and falls back to a sensible branded default for local/dev.
const DEFAULT_FROM = "Home Passport <noreply@homepassport.app>";

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

// Lazily construct the client so importing this module is free and so a missing
// key is handled as a no-op rather than a constructor throw. Returns null when no
// key is configured — every caller treats null as "skip".
function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

// Low-level send. Always resolves (never rejects). Logs on the failure/skip paths
// so problems are visible in server logs without surfacing to the user.
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const client = resendClient();
  if (!client) {
    // Dev/CI without a key: behave as a no-op so flows keep working end-to-end.
    console.info(
      `[email] RESEND_API_KEY not set — skipping send "${input.subject}" to ${input.to}`,
    );
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await client.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    if (error) {
      console.error(`[email] send failed (${input.subject}):`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    // Network / unexpected SDK failure — swallow so callers stay best-effort.
    const message = err instanceof Error ? err.message : "unknown send error";
    console.error(`[email] send threw (${input.subject}):`, message);
    return { ok: false, error: message };
  }
}

// High-level convenience: render + send a handover invitation in one call. Returns
// the same fail-soft SendResult; the route maps `ok` → its `emailed` flag.
export async function sendHandoverInvitation(
  to: string,
  data: HandoverInvitationInput,
): Promise<SendResult> {
  const { subject, html, text } = handoverInvitation(data);
  return sendEmail({ to, subject, html, text });
}
