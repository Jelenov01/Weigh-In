import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative base so the build works from any host path (root domain or a GitHub Pages subfolder).
  base: "./",
  plugins: [
    VitePWA({
      // "prompt" lets src/pwa.ts decide when to switch versions instead of reloading mid-task.
      registerType: "prompt",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "Weigh-In",
        short_name: "Weigh-In",
        description: "Track your weight, see the trend, and hit your goal.",
        theme_color: "#1d6f5f",
        background_color: "#f3f5f4",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
});
