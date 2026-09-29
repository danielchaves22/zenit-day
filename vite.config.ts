import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1430,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || "127.0.0.1",
  },
  build: { target: "es2022" },
});
