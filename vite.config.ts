import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";

export default defineConfig({
  build: { modulePreload: false, assetsInlineLimit: 0 },
  resolve: { tsconfigPaths: true },
  plugins: [glsl({ minify: true }), solid()],
});
