import { defineConfig } from "vite";

export default defineConfig({
  build: { modulePreload: false, assetsInlineLimit: 0 },
  resolve: { tsconfigPaths: true },
});
