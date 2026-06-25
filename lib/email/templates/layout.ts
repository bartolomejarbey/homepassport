import "server-only";

// Generic transactional e-mail layout (inline styles only — e-mail clients strip
// <style>/external CSS). The brand here is the same sepia / detective-noir palette
// as the app, kept minimal so it renders in Gmail, Outlook and Apple Mail alike.
//
// GDPR: this layout is for TRANSACTIONAL mail only (account/handover events the
// user explicitly triggered or is a party to). It carries NO marketing content and
// NO unsubscribe link is required. Do not reuse it for newsletters.

// Brand tokens mirrored from app/globals.css so the mail matches the product.
const C = {
  espresso: "#18120e",
  coffee: "#241B14",
  tobacco: "#3A2D22",
  caramel: "#C9986A",
  caramelLight: "#DDB088",
  parchmentGold: "#F0D4A8",
  moonlight: "#D8DDE5",
  sepia: "#C4B59A",
  sandstone: "#8B7B65",
  parchment: "#EDE2CC",
} as const;

const BRAND_NAME = "Home Passport";

// Minimal, dependency-free HTML escaper. Every caller-supplied string (property
// title, org name, …) MUST pass through this before it lands in the markup, so a
// stray "<", ">" or "&" can never break the layout or inject markup into mail.
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface LayoutInput {
  // Pre-escaped, ready-to-render HTML for the message body (paragraphs, button…).
  bodyHtml: string;
  // Plain heading shown under the wordmark (already trusted/escaped by caller).
  heading: string;
  // Short preheader (inbox preview text). Plain text; escaped here.
  preview?: string;
}

// Wrap a message body in the branded shell. Tables + inline styles on purpose:
// this is the most portable structure across mail clients. Returns a full HTML
// document string ready to hand to Resend's `html` field.
export function renderLayout({ bodyHtml, heading, preview }: LayoutInput): string {
  const year = new Date().getFullYear();
  const previewBlock = preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(
        preview,
      )}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark light" />
    <title>${esc(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${C.espresso};">
    ${previewBlock}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.espresso};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:${C.coffee};border-top:3px solid ${C.caramel};">
            <tr>
              <td style="padding:32px 36px 8px 36px;">
                <p style="margin:0;font-family:'IBM Plex Mono',Consolas,monospace;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${C.caramel};">
                  ${esc(BRAND_NAME)}
                </p>
                <h1 style="margin:14px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:600;color:${C.moonlight};">
                  ${esc(heading)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px 36px 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${C.sepia};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px;border-top:1px solid ${C.tobacco};background-color:${C.espresso};">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${C.sandstone};">
                  Tento e-mail jste obdrželi v souvislosti s úkonem ve službě ${esc(
                    BRAND_NAME,
                  )} (předání nemovitosti). Jde o transakční zprávu, nikoli o obchodní sdělení.
                </p>
                <p style="margin:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${C.sandstone};">
                  &copy; ${year} ${esc(BRAND_NAME)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Shared primitives so individual templates stay declarative and consistent.

// A paragraph of already-escaped/trusted HTML.
export function p(html: string): string {
  return `<p style="margin:0 0 16px 0;">${html}</p>`;
}

// A prominent call-to-action button (sharp corners — brand has no border-radius).
// `href` must be a server-built, trusted URL (never raw user input).
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px 0;">
    <tr>
      <td style="background-color:${C.caramel};">
        <a href="${esc(href)}" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:${C.espresso};text-decoration:none;letter-spacing:0.02em;">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

// A copy-paste fallback link block (some clients don't render the button).
export function fallbackLink(href: string): string {
  return `<p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.sandstone};">
      Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:
    </p>
    <p style="margin:0 0 8px 0;word-break:break-all;">
      <a href="${esc(href)}" style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:13px;color:${C.caramelLight};">${esc(
        href,
      )}</a>
    </p>`;
}

export const brand = { name: BRAND_NAME, colors: C };
