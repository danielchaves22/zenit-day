import { test, expect } from "@playwright/test";

test("reminder consent: login alone cannot grant access; explicit grant/revoke and mobile layout", async ({
  page,
}) => {
  const grants: { p_client_id: string; p_enabled: boolean }[] = [];
  const logoutScopes: (string | null)[] = [];
  await page.route("https://*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/auth/v1/token")
      return route.fulfill({
        json: {
          access_token: "synthetic-token",
          refresh_token: "synthetic-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "alice@example.test",
          },
        },
      });
    if (p.endsWith("/zenit_day_set_reminder_consent")) {
      const data = route.request().postDataJSON();
      grants.push(data);
      return route.fulfill({ json: { enabled: data.p_enabled } });
    }
    if (p === "/auth/v1/logout") {
      logoutScopes.push(url.searchParams.get("scope"));
      return route.fulfill({ status: 204 });
    }
    throw new Error("Unexpected request " + p);
  });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/hub/reminders");
  await page.getByLabel("E-mail").fill("alice@example.test");
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Autorizar lembretes", exact: true }),
  ).toBeVisible();
  expect(grants).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/hub-reminders-consent-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Autorizar lembretes", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "não assina notificações automaticamente",
  );
  expect(grants).toEqual([{ p_client_id: "hub-test-client", p_enabled: true }]);
  // Consent must not revoke the Hub's OAuth session or other Day sessions.
  await expect.poll(() => logoutScopes).toEqual(["local"]);
  await page.reload();
  await page.getByLabel("E-mail").fill("alice@example.test");
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Revogar acesso", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("revogado");
  expect(grants[1].p_enabled).toBe(false);
  await expect.poll(() => logoutScopes).toEqual(["local", "local"]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "synthetic-token",
  );
});
