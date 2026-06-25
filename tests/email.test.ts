import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handoverInvitation } from "@/lib/email/templates/handover-invitation";
import { esc, renderLayout } from "@/lib/email/templates/layout";

// Unit tests for the transactional e-mail module. Two pure concerns:
//   1) the handover template renders correct, escaped Czech HTML + text, and
//   2) the Resend wrapper is a SAFE no-op when RESEND_API_KEY is unset.
// No network: the no-op path returns before any client is constructed.

describe("esc", () => {
  it("escapes HTML-significant characters", () => {
    expect(esc(`<a href="x">A & B</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;A &amp; B&lt;/a&gt;",
    );
  });
});

describe("handoverInvitation template", () => {
  const claimUrl = "https://app.example.com/prevzit/abc123";

  it("includes the claim URL, property title and org name", () => {
    const { subject, html, text } = handoverInvitation({
      propertyTitle: "Byt Praha 7",
      claimUrl,
      orgName: "Stavby s.r.o.",
    });
    expect(subject).toContain("Byt Praha 7");
    expect(html).toContain(claimUrl);
    expect(html).toContain("Stavby s.r.o.");
    expect(html).toContain("Byt Praha 7");
    // Plain-text alternative is always present and carries the link.
    expect(text).toContain(claimUrl);
    expect(text).toContain("Home Passport");
  });

  it("falls back gracefully when title/org are missing", () => {
    const { subject, html } = handoverInvitation({
      propertyTitle: null,
      claimUrl,
      orgName: null,
    });
    expect(subject).toContain("vaše nová nemovitost");
    // Generic ("Pro vás byl připraven") phrasing instead of a company name.
    expect(html).toContain("Pro vás byl připraven");
  });

  it("escapes a malicious property title so it cannot inject markup", () => {
    const { html } = handoverInvitation({
      propertyTitle: `<script>alert(1)</script>`,
      claimUrl,
      orgName: null,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderLayout", () => {
  it("wraps body html and renders the heading + brand wordmark", () => {
    const html = renderLayout({ heading: "Nadpis", bodyHtml: "<p>Ahoj</p>" });
    expect(html).toContain("Home Passport");
    expect(html).toContain("Nadpis");
    expect(html).toContain("<p>Ahoj</p>");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });
});

describe("sendEmail (no-op without RESEND_API_KEY)", () => {
  const prev = process.env.RESEND_API_KEY;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
    vi.restoreAllMocks();
  });

  it("returns skipped:true and never throws when the key is unset", async () => {
    // Import after the env is cleared so module-level code sees no key.
    const { sendEmail } = await import("@/lib/email/client");
    const res = await sendEmail({
      to: "buyer@example.com",
      subject: "Test",
      html: "<p>x</p>",
    });
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe(true);
  });
});
