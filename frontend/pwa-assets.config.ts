import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Generates the PWA icons (any + maskable + apple-touch + favicon.ico) from one SVG.
// Run: npm run icons
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#6a5ce0" } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: "#6a5ce0" } },
  },
  images: ["public/favicon.svg"],
});
