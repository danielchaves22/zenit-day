// Run only with the isolated test build described in docs/VALIDACAO_0.1.8.md.
const { chromium, expect } = require("@playwright/test");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const { mkdir } = require("node:fs/promises");
const assert = require("node:assert/strict");
const identifier = "br.com.equinox.zenitday.traytest20260929";
const url = "https://zenit-day-test.supabase.co";
const user = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const executable = resolve("src-tauri/target/debug/zenit-day.exe");
const directory = resolve("test-results/native-tray");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = new Map();
let online = true,
  writes = 0;
const ipc = (page, command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
function secondInstance(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Second instance: " + code)),
    );
  });
}
(async () => {
  await mkdir(directory, { recursive: true });
  const app = spawn(executable, ["--background"], {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9336",
      WEBVIEW2_USER_DATA_FOLDER: resolve(directory, "webview-profile"),
    },
  });
  let browser,
    page,
    trusted = false;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch("http://127.0.0.1:9336/json/version")).ok) break;
      } catch {}
      await delay(500);
    }
    browser = await chromium.connectOverCDP("http://127.0.0.1:9336");
    const context = browser.contexts()[0];
    page =
      context.pages().find((p) => !p.url().includes("capture=1")) ||
      (await context.waitForEvent("page"));
    await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
    assert.equal(
      await ipc(page, "plugin:app|identifier"),
      identifier,
      "Refusing to test a real installation",
    );
    trusted = true;
    await context.route(url + "/**", async (route) => {
      if (!online) return route.abort("internetdisconnected");
      const request = route.request(),
        path = new URL(request.url()).pathname;
      const data = request.method() === "POST" ? request.postDataJSON() : null;
      const uid = request.headers().authorization?.includes(bob) ? bob : user;
      let result = {};
      if (path === "/auth/v1/token") {
        const id = data?.email === "bob@example.test" ? bob : user;
        result = {
          access_token: id,
          refresh_token: "synthetic",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id,
            email: id === user ? "alice@example.test" : "bob@example.test",
          },
        };
      } else if (path.endsWith("/zenit_day_connection_check"))
        result = {
          application: "zenit-day",
          authenticated: true,
          schema_version: 1,
          daily_goals: true,
          checklist: true,
          groups: true,
          priorities: true,
        };
      else if (path.endsWith("/zenit_day_save_subject")) {
        const key = uid + "|" + data.p_subject_id,
          previous = rows.get(key),
          now = new Date().toISOString();
        const subject = {
          ...data.p_subject,
          user_id: uid,
          id: data.p_subject_id,
          revision: data.p_expected_revision + 1,
          created_at: previous?.created_at ?? now,
          updated_at: now,
          completed_at: null,
        };
        rows.set(key, subject);
        writes++;
        result = { result: "saved", subject };
      } else if (path.endsWith("/zenit_day_subjects"))
        result = [...rows.values()].filter((r) => r.user_id === uid);
      else if (path.endsWith("/zenit_day_updates")) result = [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    // Only the dedicated test database is touched; no real session or workspace is read.
    await ipc(page, "session_write", { namespace: url, value: null });
    for (const uid of [user, bob]) {
      const namespace = url + "|" + uid;
      const stored = await ipc(page, "workspace_read", { namespace });
      await ipc(page, "workspace_write", {
        namespace,
        expected: stored.version,
        data: JSON.stringify({
          schema: 1,
          subjects: {},
          queue: [],
          history: [],
          conflicts: {},
          recovery: [],
          lastSync: null,
        }),
      });
    }
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Vamos começar?" }),
    ).toBeVisible();
    assert.equal(
      await ipc(page, "plugin:window|is_visible", { label: "main" }),
      false,
    );
    await secondInstance([]);
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "main" }))
      .toBe(true);
    // Native close requests use the same CloseRequested handler as the title-bar X.
    await ipc(page, "plugin:window|close", { label: "main" });
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "main" }))
      .toBe(false);
    assert.equal(app.exitCode, null);
    await secondInstance([]);
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "main" }))
      .toBe(true);
    async function login(email) {
      await page.getByLabel("E-mail", { exact: true }).fill(email);
      await page
        .getByLabel("Senha", { exact: true })
        .fill("synthetic-password");
      await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
      await expect(
        page.getByRole("heading", { name: "Hoje", exact: true }),
      ).toBeVisible();
    }
    await login("alice@example.test");
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No Windows" }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Manter na bandeja/ }),
    ).toHaveCount(0);
    await expect(page.locator(".windows-settings")).toContainText(
      "Ao fechar a janela, o Zenit Day continua na bandeja.",
    );
    // This registry entry is named after the test application, never Zenit Day.
    await ipc(page, "desktop_set_preference", {
      key: "autostart",
      enabled: true,
    });
    assert.equal((await ipc(page, "desktop_preferences")).autostart, true);
    await ipc(page, "desktop_set_preference", {
      key: "autostart",
      enabled: false,
    });
    await page.getByRole("button", { name: "Abrir captura rápida" }).click();
    await expect
      .poll(() => context.pages().some((p) => p.url().includes("capture=1")))
      .toBe(true);
    const capture = context.pages().find((p) => p.url().includes("capture=1"));
    const title = capture.getByLabel("O que você precisa fazer ou acompanhar?");
    await expect(title).toBeEnabled();
    await expect(capture.locator(".capture-actions")).toContainText(
      "alice@example.test",
    );
    await assert.rejects(ipc(capture, "session_read", { namespace: url }));
    await assert.rejects(
      ipc(capture, "workspace_read", { namespace: url + "|" + user }),
    );
    await ipc(page, "plugin:window|close", { label: "main" });
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "main" }))
      .toBe(false);
    assert.equal(app.exitCode, null);
    online = false;
    await capture
      .getByRole("combobox", { name: "Prioridade", exact: true })
      .selectOption("urgent");
    await title.fill("Assunto capturado offline");
    await capture.screenshot({
      path: resolve(directory, "capture.png"),
      fullPage: true,
    });
    await title.press("Enter");
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "capture" }))
      .toBe(false);
    const namespace = url + "|" + user;
    const stored = JSON.parse(
      (await ipc(page, "workspace_read", { namespace })).data,
    );
    assert.equal(stored.queue.length, 1);
    assert.equal(Object.values(stored.subjects)[0].priority, "urgent");
    assert.equal(
      Object.values(stored.subjects)[0].title,
      "Assunto capturado offline",
    );
    assert.equal(writes, 0);
    // Retry the same capture id after a lost reply: it must not add another operation.
    await ipc(capture, "desktop_capture_submit", {
      namespace,
      id: Object.keys(stored.subjects)[0],
      title: "Assunto capturado offline",
      priority: "urgent",
    });
    assert.equal(
      JSON.parse((await ipc(page, "workspace_read", { namespace })).data).queue
        .length,
      1,
    );
    await secondInstance([]);
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "main" }))
      .toBe(true);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    online = true;
    await page.getByRole("button", { name: "Sincronizar agora" }).click();
    await expect.poll(() => writes).toBe(1);
    await page.getByRole("button", { name: /^Acompanhamentos/ }).click();
    await secondInstance(["--today"]);
    await expect(
      page.getByRole("heading", { name: "Hoje", exact: true }),
    ).toBeVisible();
    await secondInstance(["--capture"]);
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "capture" }))
      .toBe(true);
    await title.fill("Rascunho preservado");
    await capture
      .getByRole("combobox", { name: "Prioridade", exact: true })
      .selectOption("low");
    await ipc(page, "plugin:window|close", { label: "capture" });
    await expect
      .poll(() => ipc(page, "plugin:window|is_visible", { label: "capture" }))
      .toBe(false);
    await secondInstance(["--capture"]);
    await expect(title).toHaveValue("Rascunho preservado");
    await expect(
      capture.getByRole("combobox", { name: "Prioridade", exact: true }),
    ).toHaveValue("low");
    await title.press("Escape");
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    await page
      .getByRole("button", { name: "Sair da conta", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Sair da conta", exact: true })
      .click();
    await login("bob@example.test");
    await secondInstance(["--capture"]);
    await expect(title).toHaveValue("");
    await expect(
      capture.getByRole("combobox", { name: "Prioridade", exact: true }),
    ).toHaveValue("normal");
    await expect(capture.locator(".capture-actions")).toContainText(
      "bob@example.test",
    );
    await title.press("Escape");
    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    await page.screenshot({
      path: resolve(directory, "windows-settings.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    if (process.env.ZENIT_DAY_TRAY_TEST_KEEP_OPEN === "1") {
      console.log("READY_FOR_NATIVE_UI pid=" + app.pid);
      await new Promise((resolve) => {
        process.stdin.once("data", resolve);
        setTimeout(resolve, 180000).unref();
      });
    }
    await ipc(page, "desktop_set_preference", {
      key: "autostart",
      enabled: false,
    });
    // Test-only capability: exercises AppHandle::exit, also used by the tray's quit item.
    await ipc(page, "plugin:app|exit", { code: 0 }).catch((error) => {
      if (!String(error).includes("closed")) throw error;
    });
    await expect.poll(() => app.exitCode, { timeout: 10000 }).toBe(0);
    console.log(
      "PASS: close to tray before/after login, restore existing instance, capture with main window hidden, offline SQLite, retry without duplication, synchronization, draft after native close, account separation, autostart toggle and explicit application exit.",
    );
  } finally {
    if (trusted && page && !page.isClosed()) {
      await ipc(page, "desktop_set_preference", {
        key: "autostart",
        enabled: false,
      }).catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    if (app.pid && app.exitCode === null)
      await new Promise((resolve) =>
        spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        }).once("close", resolve),
      );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
