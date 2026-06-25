import "server-only";
import {
  renderLayout,
  p,
  button,
  fallbackLink,
  esc,
} from "./layout";

// Handover invitation e-mail: the B2B headline flow. A developer / správce creates
// an invitation for a property; the buyer receives this mail with a one-time claim
// link (/prevzit/<token>) that lets them take over the transferable passport layer.
//
// The mail never exposes private property data — only the title (chosen by the
// owner), who is handing it over, and the claim link. Token is opaque and acts as
// a one-shot claim, not as authentication.

export interface HandoverInvitationInput {
  // Human title of the property (may be empty/null → we fall back to a generic).
  propertyTitle?: string | null;
  // Absolute, server-built claim URL: `${origin}/prevzit/<token>`.
  claimUrl: string;
  // Name of the organisation handing the property over (may be empty/null).
  orgName?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Build the subject + HTML + text for a handover invitation. Pure: takes data,
// returns strings. The route is responsible for actually sending it.
export function handoverInvitation({
  propertyTitle,
  claimUrl,
  orgName,
}: HandoverInvitationInput): RenderedEmail {
  const title = propertyTitle?.trim() || "vaše nová nemovitost";
  const org = orgName?.trim();
  const fromLine = org
    ? `Společnost <strong style="color:#D8DDE5;">${esc(org)}</strong> pro vás připravila`
    : "Pro vás byl připraven";

  const heading = "Převezměte digitální pas nemovitosti";

  const bodyHtml = [
    p("Dobrý den,"),
    p(
      `${fromLine} digitální pas nemovitosti <strong style="color:#D8DDE5;">${esc(
        title,
      )}</strong>. Najdete v něm přenositelné dokumenty, revize a kontext, které se k nemovitosti vztahují.`,
    ),
    p(
      "Pro převzetí klikněte na tlačítko níže. Odkaz je jednorázový a slouží pouze k tomuto převzetí — nezveřejňujte ho.",
    ),
    button(claimUrl, "Převzít nemovitost"),
    fallbackLink(claimUrl),
    p(
      '<span style="font-size:13px;color:#8B7B65;">Pokud jste tento e-mail nečekali, můžete jej ignorovat — bez otevření odkazu se nic nestane.</span>',
    ),
  ].join("\n");

  const html = renderLayout({
    heading,
    bodyHtml,
    preview: org
      ? `${org} vám předává digitální pas nemovitosti ${title}.`
      : `Digitální pas nemovitosti ${title} čeká na převzetí.`,
  });

  // Plain-text alternative — improves deliverability and serves clients that don't
  // render HTML. Mirrors the HTML content without markup.
  const text = [
    "Dobrý den,",
    "",
    org
      ? `Společnost ${org} pro vás připravila digitální pas nemovitosti "${title}".`
      : `Pro vás byl připraven digitální pas nemovitosti "${title}".`,
    "Najdete v něm přenositelné dokumenty, revize a kontext k nemovitosti.",
    "",
    "Pro převzetí otevřete tento jednorázový odkaz:",
    claimUrl,
    "",
    "Odkaz nezveřejňujte. Pokud jste tento e-mail nečekali, ignorujte ho.",
    "",
    "Home Passport",
  ].join("\n");

  return { subject: `Převzetí nemovitosti: ${title}`, html, text };
}
