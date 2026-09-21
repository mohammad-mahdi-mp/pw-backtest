import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri expects a fixed dev port (see app/src-tauri/tauri.conf.json devUrl).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Dev-only: the sandbox preview proxies through varying hostnames.
    // Does not affect production builds.
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
