const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const { mkdir } = require("node:fs/promises");
const assert = require("node:assert/strict");

(async () => {
  const directory = resolve("test-results/native-windows");
  await mkdir(directory, { recursive: true });
  const executable = resolve("src-tauri/target/release/zenit-day.exe");
  const app = spawn(executable, [], {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9335",
      WEBVIEW2_USER_DATA_FOLDER: resolve(directory, "webview-profile"),
    },
  });
  let browser;
  try {
    for (let n = 0; n < 60; n++) {
      try {
        const r = await fetch("http://127.0.0.1:9335/json/version");
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    browser = await chromium.connectOverCDP("http://127.0.0.1:9335");
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.waitForEvent("page"));
    await page
      .getByRole("heading", { name: "Vamos começar?" })
      .waitFor({ timeout: 30000 });
    assert.equal(await page.getByLabel("E-mail", { exact: true }).count(), 1);
    const results = await page.evaluate(async () => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const namespace = "zenit-day-native-smoke-session";
      await invoke("session_write", {
        namespace,
        value: "synthetic-test-session",
      });
      const roundTrip = await invoke("session_read", { namespace });
      await invoke("session_write", { namespace, value: null });
      const removed = await invoke("session_read", { namespace });
      const missing = await invoke("workspace_read", {
        namespace: "zenit-day-unused-smoke-workspace",
      });
      return { roundTrip, removed, missing };
    });
    assert.equal(results.roundTrip, "synthetic-test-session");
    assert.equal(results.removed, null);
    assert.deepEqual(results.missing, { version: 0, data: null });
    await page.screenshot({
      path: resolve(directory, "login.png"),
      fullPage: true,
    });
    console.log(
      "Windows nativo: abertura, SQLite e sessao protegida via IPC validados. Nenhuma conta real foi utilizada.",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (app.pid)
      await new Promise((resolve) => {
        spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        }).on("close", resolve);
      });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
