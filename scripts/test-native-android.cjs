const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const { mkdir } = require("node:fs/promises");
const { resolve } = require("node:path");
const assert = require("node:assert/strict");
const device = process.env.ZENIT_DAY_TEST_DEVICE || "emulator-5558";
const adb = (...args) =>
  execFileSync("adb", ["-s", device, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  }).trim();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect() {
  let pid = "";
  for (let n = 0; n < 40; n++) {
    try {
      pid = adb("shell", "pidof", "br.com.equinox.zenitday");
      if (pid) break;
    } catch {}
    await wait(500);
  }
  if (!pid) throw new Error("O aplicativo não abriu no emulador.");
  adb("forward", "tcp:9336", `localabstract:webview_devtools_remote_${pid}`);
  let browser;
  let connectionError;
  for (let n = 0; n < 40; n++) {
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9336", {
        noDefaults: true,
        timeout: 5000,
      });
      break;
    } catch (error) {
      connectionError = error;
      await wait(500);
    }
  }
  if (!browser)
    throw new Error(
      `WebView Android não ficou disponível: ${connectionError?.message}`,
    );
  const context = browser.contexts()[0];
  await context.route("https://*.supabase.co/**", (route) => route.abort());
  const page = context.pages()[0] || (await context.waitForEvent("page"));
  await page
    .getByRole("heading", { name: "Vamos começar?" })
    .waitFor({ timeout: 30000 });
  return { browser, page };
}
(async () => {
  const out = resolve("test-results/native-android");
  await mkdir(out, { recursive: true });
  adb("shell", "am", "start", "-n", "br.com.equinox.zenitday/.MainActivity");
  let { browser, page } = await connect();
  try {
    await page.evaluate(async () => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      await invoke("session_write", {
        namespace: "native-test-vault",
        value: "synthetic-protected-session",
      });
      const previous = await invoke("workspace_read", {
        namespace: "native-test-workspace",
      });
      await invoke("workspace_write", {
        namespace: "native-test-workspace",
        expected: previous.version,
        data: JSON.stringify({
          schema: 1,
          subjects: {},
          queue: [{ id: "offline-proof" }],
        }),
      });
    });
    await page.screenshot({ path: resolve(out, "login.png"), fullPage: true });
    const prefs = adb(
      "shell",
      "run-as",
      "br.com.equinox.zenitday",
      "cat",
      "shared_prefs/zenit-day-session.xml",
    );
    assert.equal(prefs.includes("synthetic-protected-session"), false);
    await browser.close();
    adb("shell", "am", "force-stop", "br.com.equinox.zenitday");
    adb("shell", "am", "start", "-n", "br.com.equinox.zenitday/.MainActivity");
    ({ browser, page } = await connect());
    const result = await page.evaluate(async () => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      return {
        session: await invoke("session_read", {
          namespace: "native-test-vault",
        }),
        workspace: await invoke("workspace_read", {
          namespace: "native-test-workspace",
        }),
      };
    });
    assert.equal(result.session, "synthetic-protected-session");
    assert.equal(
      JSON.parse(result.workspace.data).queue[0].id,
      "offline-proof",
    );
    await page.evaluate(() =>
      window.__TAURI_INTERNALS__.invoke("session_write", {
        namespace: "native-test-vault",
        value: null,
      }),
    );
    console.log(
      "Android nativo: abertura, sessao cifrada e SQLite persistentes apos encerrar/reabrir validados no emulador.",
    );
  } finally {
    await browser.close().catch(() => {});
    adb("forward", "--remove", "tcp:9336");
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
