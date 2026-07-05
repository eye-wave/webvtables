import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    fs: {
      allow: ["index.html", "src", "target/wasm32-unknown-unknown/release"],
    },
  },
  build: {
    modulePreload: false,
  },
  plugins: [glsl({ minify: true })],
});
