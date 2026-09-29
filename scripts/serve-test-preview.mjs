import { build, preview } from "vite";
process.env.VITE_SUPABASE_URL = "https://zenit-day-test.supabase.co";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_synthetic_e2e";
const buildOptions = { outDir: "test-results/web-dist", emptyOutDir: true };
await build({ build: buildOptions });
await preview({
  build: buildOptions,
  preview: { host: "127.0.0.1", port: 1431, strictPort: true },
});
