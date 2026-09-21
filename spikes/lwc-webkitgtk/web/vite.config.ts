import { defineConfig } from "vite";

// Spike dev port (separate from the main ui/ dev server on 5173).
export default defineConfig({
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5180,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
