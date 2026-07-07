import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
