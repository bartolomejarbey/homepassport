// e2e/pilot.spec.ts — public B2B pilot-request form (app/(pro)/pro/poptavka).
// This page is a carve-out from the console auth gate (see proxy.ts), so it must
// render for logged-out visitors. It is fully client-side (mailto on submit),
// needs no backend, and gates its submit button on simple field validity.
import { test, expect } from "@playwright/test";

test.describe("Public pilot request (/pro/poptavka)", () => {
  test("renders the pilot form for anonymous visitors", async ({ page }) => {
    await page.goto("/pro/poptavka");

    await expect(
      page.getByRole("heading", { name: /Domluvte si pilot/i }),
    ).toBeVisible();
    // Core fields.
    await expect(page.getByLabel("Název firmy")).toBeVisible();
    await expect(page.getByLabel("Kontaktní osoba")).toBeVisible();
    await expect(page.getByLabel("Pracovní e-mail")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Odeslat poptávku/i }),
    ).toBeVisible();
  });

  test("submit button is disabled until required fields are valid", async ({
    page,
  }) => {
    await page.goto("/pro/poptavka");
    const submit = page.getByRole("button", { name: /Odeslat poptávku/i });

    // Empty form -> disabled.
    await expect(submit).toBeDisabled();

    // Fill the three required fields (company>=2, name>=2, plausible email).
    await page.getByLabel("Název firmy").fill("Novostavby Morava s.r.o.");
    await page.getByLabel("Kontaktní osoba").fill("Jan Novák");
    await page.getByLabel("Pracovní e-mail").fill("jan@firma.cz");

    await expect(submit).toBeEnabled();
  });

  test("invalid email keeps the submit button disabled", async ({ page }) => {
    await page.goto("/pro/poptavka");
    await page.getByLabel("Název firmy").fill("Firma s.r.o.");
    await page.getByLabel("Kontaktní osoba").fill("Jan Novák");
    await page.getByLabel("Pracovní e-mail").fill("neplatny-email");
    await expect(
      page.getByRole("button", { name: /Odeslat poptávku/i }),
    ).toBeDisabled();
  });
});
