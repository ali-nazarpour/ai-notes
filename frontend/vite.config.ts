/**
 * Vite (dev server/build), the PWA plugin and Vitest.
 *
 * In development the `/api` proxy forwards API calls to the backend so the app and the API
 * share one origin; in Docker nginx does the same (see nginx.conf).
 */
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const THEME_COLOR = "#4f5bd5";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The user decides when to reload into a new version (see src/pwa/pwa.tsx).
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        id: "/",
        name: "AI Notes",
        short_name: "AI Notes",
        description: "Notes, tasks and a private AI assistant that runs on your own computer.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        orientation: "any",
        theme_color: THEME_COLOR,
        background_color: "#f4f5f9",
        categories: ["productivity", "utilities"],
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          {
            name: "New note",
            short_name: "Note",
            url: "/notes/new",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "New task",
            short_name: "Task",
            url: "/tasks?new=1",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Chatbot",
            short_name: "Chatbot",
            url: "/chat",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Uploaded images never change (their URL is a new id per upload).
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith("/api/files/") && request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "note-images",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    alias: {
      "virtual:pwa-register/react": "/src/test/pwaRegisterStub.ts",
    },
  },
});
