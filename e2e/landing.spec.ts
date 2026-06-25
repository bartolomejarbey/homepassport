// e2e/landing.spec.ts — the public marketing landing page (app/page.tsx).
// Renders with the placeholder env: no Supabase/AI calls happen here.
import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders hero, B2B and B2C sections, and nav links", async ({ page }) => {
    await page.goto("/");

    // Hero headline (split across two lines in the markup).
    await expect(
      page.getByRole("heading", { level: 1, name: /Celý váš domov/i }),
    ).toBeVisible();
    await expect(page.getByText(/Jeden digitální pas/i)).toBeVisible();

    // B2C product card (Home OS — pro majitele).
    await expect(
      page.getByRole("heading", { name: /Home OS — pro majitele/i }),
    ).toBeVisible();
    // B2B product card (Home Passport — pro firmy).
    await expect(
      page.getByRole("heading", { name: /Home Passport — pro firmy/i }),
    ).toBeVisible();
    // B2B band CTA section.
    await expect(
      page.getByRole("heading", {
        name: /Pas nemovitosti jako součást předání klíčů/i,
      }),
    ).toBeVisible();

    // Primary nav (desktop) anchor links to the on-page sections.
    const nav = page.getByRole("navigation", { name: "Hlavní" });
    await expect(nav.getByRole("link", { name: "Produkt" })).toHaveAttribute(
      "href",
      "#produkt",
    );
    await expect(nav.getByRole("link", { name: "Pro firmy" })).toHaveAttribute(
      "href",
      "#pro-firmy",
    );
    await expect(nav.getByRole("link", { name: "Bezpečnost" })).toHaveAttribute(
      "href",
      "#bezpecnost",
    );
  });

  test("header CTA 'Vyzkoušet' navigates to /registrace", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Vyzkoušet" }).click();
    await expect(page).toHaveURL(/\/registrace$/);
    await expect(
      page.getByRole("heading", { name: /Založte si pas zdarma/i }),
    ).toBeVisible();
  });

  test("hero CTA 'Založit pas zdarma' navigates to /registrace", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /Založit pas zdarma/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/registrace$/);
  });

  test("B2B CTA 'Domluvit pilot' navigates to /pro/poptavka", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Domluvit pilot/i }).click();
    await expect(page).toHaveURL(/\/pro\/poptavka$/);
    await expect(
      page.getByRole("heading", { name: /Domluvte si pilot/i }),
    ).toBeVisible();
  });

  test("header 'Přihlásit' navigates to /prihlaseni", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Přihlásit" }).click();
    await expect(page).toHaveURL(/\/prihlaseni$/);
  });
});
