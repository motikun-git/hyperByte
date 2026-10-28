import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development the PHP API runs on http://localhost:8000
// (php -S localhost:8000 dev-router.php). Vite forwards /api and /uploads
// there, so the website and the API share one address and the admin
// login cookie works.
const api = { target: "http://localhost:8000", changeOrigin: false };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": api, "/uploads": api },
  },
  preview: {
    port: 4173,
    proxy: { "/api": api, "/uploads": api },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
