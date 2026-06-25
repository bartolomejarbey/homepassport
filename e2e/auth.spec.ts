// e2e/auth.spec.ts — login & signup screens (app/(auth)/*).
// These are Server Components that call supabase.auth.getUser(); with the
// placeholder env there is no session, so the page renders the form (no
// redirect). We exercise only client-side behaviour that needs no real backend:
// react-hook-form + zod validation and the login<->signup toggle's ?next carry.
import { test, expect } from "@playwright/test";

test.describe("Login page (/prihlaseni)", () => {
  test("renders the login form", async ({ page }) => {
    await page.goto("/prihlaseni");
    await expect(
      page.getByRole("heading", { name: /Vítejte zpět/i }),
    ).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Heslo")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Přihlásit se" }),
    ).toBeVisible();
    // Signup-only field must NOT be present in login mode.
    await expect(page.getByLabel("Jméno a příjmení")).toHaveCount(0);
  });

  test("empty submit shows zod validation errors (no backend call)", async ({
    page,
  }) => {
    await page.goto("/prihlaseni");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    // Email + password are both required by the zod schema.
    await expect(page.getByText("Zadejte e-mail")).toBeVisible();
    await expect(
      page.getByText("Heslo musí mít alespoň 8 znaků"),
    ).toBeVisible();
    // We never navigated away — still on the login route.
    await expect(page).toHaveURL(/\/prihlaseni$/);
  });

  test("invalid email + short password show field errors", async ({ page }) => {
    await page.goto("/prihlaseni");
    await page.getByLabel("E-mail").fill("not-an-email");
    await page.getByLabel("Heslo").fill("short");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page.getByText("Neplatný e-mail")).toBeVisible();
    await expect(
      page.getByText("Heslo musí mít alespoň 8 znaků"),
    ).toBeVisible();
  });
});

test.describe("Signup page (/registrace)", () => {
  test("renders the signup form with the name field", async ({ page }) => {
    await page.goto("/registrace");
    await expect(
      page.getByRole("heading", { name: /Založte si pas zdarma/i }),
    ).toBeVisible();
    await expect(page.getByLabel("Jméno a příjmení")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Heslo")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Založit pas zdarma" }),
    ).toBeVisible();
  });

  test("empty submit shows zod validation errors", async ({ page }) => {
    await page.goto("/registrace");
    await page.getByRole("button", { name: "Založit pas zdarma" }).click();
    await expect(page.getByText("Zadejte e-mail")).toBeVisible();
    await expect(
      page.getByText("Heslo musí mít alespoň 8 znaků"),
    ).toBeVisible();
  });
});

test.describe("Auth toggle preserves ?next", () => {
  const next = "/prevzit/abc-123";

  test("login -> signup keeps ?next", async ({ page }) => {
    await page.goto(`/prihlaseni?next=${encodeURIComponent(next)}`);
    await page.getByRole("link", { name: "Vytvořit účet" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/registrace\\?next=${encodeURIComponent(next)}`),
    );
    // And the signup form is shown.
    await expect(page.getByLabel("Jméno a příjmení")).toBeVisible();
  });

  test("signup -> login keeps ?next", async ({ page }) => {
    await page.goto(`/registrace?next=${encodeURIComponent(next)}`);
    await page.getByRole("link", { name: "Přihlásit se" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/prihlaseni\\?next=${encodeURIComponent(next)}`),
    );
    await expect(
      page.getByRole("heading", { name: /Vítejte zpět/i }),
    ).toBeVisible();
  });
});
