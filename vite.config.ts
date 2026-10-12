import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";
import { createHtmlPlugin } from "vite-plugin-html";
import md from "./scripts/md";

export default defineConfig({
  base: "/webvtables/",
  build: {
    modulePreload: false,
    assetsInlineLimit: 0,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    md(),
    glsl({ minify: true }),
    solid(),
    createHtmlPlugin({ minify: true }),
  ],
});
