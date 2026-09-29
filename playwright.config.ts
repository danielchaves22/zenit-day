import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/playwright",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:1431",
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-test-preview.mjs",
    url: "http://127.0.0.1:1431",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://zenit-day-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_e2e",
    },
  },
  reporter: "list",
});
