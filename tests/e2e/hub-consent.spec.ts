import { test, expect } from "@playwright/test";

test("authorizes Day in the provider page and returns only a code to Hub", async ({ page }) => {
  const requests: { url: string; body: unknown }[] = [];
  await page.route("https://*.supabase.co/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    requests.push({ url: url.pathname, body });
    let result: unknown;
    if (url.pathname.endsWith("/token")) result = { access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600,
      token_type: "bearer", user: { id: "11111111-1111-4111-8111-111111111111", email: "day@example.test", aud: "authenticated" } };
    else if (url.pathname.endsWith("/consent")) result = { redirect_url: "https://hub.example.test/oauth/day/callback?code=short-code&state=state123" };
    else if (url.pathname.includes("/oauth/authorizations/")) result = { authorization_id: "auth123", redirect_uri: "https://hub.example.test/oauth/day/callback",
      client: { id: "hub-test-client", name: "Zenit Hub", uri: "https://hub.example.test" }, user: { id: "11111111-1111-4111-8111-111111111111", email: "day@example.test" }, scope: "email" };
    else result = {};
    await route.fulfill({ json: result });
  });
  await page.route("https://hub.example.test/**", route => route.fulfill({ body: "Confirme no WhatsApp", contentType: "text/html" }));
  await page.goto("/oauth/consent?authorization_id=auth123");
  await expect(page.getByRole("heading", { name: "Conectar ao Zenit Hub" })).toBeVisible();
  await page.getByLabel("E-mail").fill("day@example.test");
  await page.getByLabel("Senha").fill("synthetic-password");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("day@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText(/somente para leitura/)).toBeVisible();
  await page.screenshot({ path: "test-results/hub-consent-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Autorizar conexão" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "test-results/hub-consent-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Autorizar conexão" }).click();
  await expect(page).toHaveURL("https://hub.example.test/oauth/day/callback?code=short-code&state=state123");
  expect(requests.filter(r => r.url.endsWith("/consent"))[0].body).toEqual({ action: "approve" });
  expect(requests.filter(r => r.url.includes("/oauth/")).every(r => !JSON.stringify(r.body).includes("synthetic-password"))).toBeTruthy();
});

test("rejects a missing authorization request before requesting credentials", async ({ page }) => {
  await page.goto("/oauth/consent");
  await expect(page.getByRole("alert")).toContainText("link é inválido");
  await expect(page.getByLabel("Senha")).toHaveCount(0);
});
