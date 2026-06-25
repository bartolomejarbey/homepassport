// e2e/handover.spec.ts — public token-gated handover page (app/prevzit/[token]).
// With the placeholder Supabase env the admin lookup of the invitation token
// resolves to no row, so the page renders its branded "invalid invitation"
// state instead of crashing. This is exactly the unhappy path we want to lock
// in: a bogus token must degrade gracefully for an anonymous visitor.
import { test, expect } from "@playwright/test";

test.describe("Handover page with a bad token (/prevzit/<bad-token>)", () => {
  test("shows the invalid/expired state and does not crash", async ({
    page,
  }) => {
    const resp = await page.goto("/prevzit/definitely-not-a-real-token");

    // The route handler itself must respond OK (it renders an error *state*,
    // not an HTTP error / Next error overlay).
    expect(resp?.status()).toBeLessThan(500);

    // Branded shell is present even on the error screen (brand is a span, not a
    // heading — the only heading here is the error title below).
    await expect(page.getByText("Home Passport")).toBeVisible();

    // The invalid-invitation state: error heading + a way back home. (We assert
    // the heading rather than role=alert, since Next injects its own
    // route-announcer with role="alert".)
    await expect(
      page.getByRole("heading", { name: /Pozvánka nenalezena/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Zpět na úvod" }),
    ).toBeVisible();

    // No Next.js error overlay / unhandled crash leaked to the page.
    await expect(
      page.getByText(/Application error|Unhandled Runtime Error/i),
    ).toHaveCount(0);
  });

  test("'Zpět na úvod' returns to the landing page", async ({ page }) => {
    await page.goto("/prevzit/another-bad-token");
    await page.getByRole("link", { name: "Zpět na úvod" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /Celý váš domov/i }),
    ).toBeVisible();
  });
});
