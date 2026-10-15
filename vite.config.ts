import { defineConfig, lazyPlugins } from "vite-plus";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";
import { createHtmlPlugin } from "vite-plugin-html";
import betterEnums from "vite-plugin-better-enums";
import md from "./scripts/md.js";

export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  base: "/webvtables/",
  build: {
    modulePreload: false,
    assetsInlineLimit: 0,
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [
    betterEnums(),
    md(),
    glsl({ minify: true }),
    solid(),
    createHtmlPlugin({ minify: true }),
  ]),
});
