import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import solid from "vite-plugin-solid";
import { createHtmlPlugin } from "vite-plugin-html";
import mdx from "./scripts/mdx";

export default defineConfig({
  base: "/webvtables/",
  build: {
    modulePreload: false,
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        chunkFileNames: (chunk) =>
          chunk.facadeModuleId?.endsWith(".mdx")
            ? "assets/docs/[name]-[hash].js"
            : "assets/[name]-[hash].js",
      },
    },
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    mdx(),
    glsl({ minify: true }),
    solid(),
    createHtmlPlugin({ minify: true }),
  ],
});
