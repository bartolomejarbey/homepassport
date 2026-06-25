// e2e/protected.spec.ts — auth gate enforced by proxy.ts.
// An unauthenticated visitor hitting a protected prefix (e.g. /prehled) must be
// redirected to /prihlaseni, with the original path preserved in ?next so login
// can bounce them back. No real Supabase session exists under the placeholder
// env, so getUser() returns null and the redirect fires.
import { test, expect } from "@playwright/test";

test.describe("Protected route redirect (unauthenticated)", () => {
  test("/prehled redirects anonymous users to /prihlaseni with ?next", async ({
    page,
  }) => {
    await page.goto("/prehled");

    await expect(page).toHaveURL(/\/prihlaseni\?next=/);
    // The original destination is carried through for post-login bounce-back.
    const url = new URL(page.url());
    expect(url.pathname).toBe("/prihlaseni");
    expect(url.searchParams.get("next")).toBe("/prehled");

    // The login form is actually rendered at the destination.
    await expect(
      page.getByRole("heading", { name: /Vítejte zpět/i }),
    ).toBeVisible();
  });

  test("a deeper protected path is preserved in ?next", async ({ page }) => {
    await page.goto("/dokumenty");
    await expect(page).toHaveURL(/\/prihlaseni\?next=/);
    const url = new URL(page.url());
    expect(url.searchParams.get("next")).toBe("/dokumenty");
  });
});
