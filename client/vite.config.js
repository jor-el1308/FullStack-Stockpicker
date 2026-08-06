import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vitest config for the unit tests under client/tests/ (A3). Uses jsdom so
  // React components can render in a fake DOM, and a setup file that loads the
  // jest-dom matchers (toBeInTheDocument, etc).
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    css: false,
  },
  server: {
    // 5173 (Vite's default) lives inside a Windows reserved port range on some
    // machines (Hyper-V/WSL/Docker reserve 5098-5197), making local
    // `npm run dev` fail with EACCES. Default to 5200 (outside that range) and
    // allow an override via VITE_PORT. Set VITE_PORT=5173 in Docker, where the
    // Windows exclusion doesn't apply, to keep the container port mapping.
    port: Number(process.env.VITE_PORT) || 5200,
    // Allows Docker to override where /api gets proxied to - inside the
    // Docker network "localhost" would mean the client container itself,
    // not the server container, so docker-compose.yml sets this to
    // http://server:4000 (the service name). Plain `npm run dev` outside
    // Docker is unaffected and keeps using localhost:4000.
    host: process.env.VITE_HOST ?? undefined,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});