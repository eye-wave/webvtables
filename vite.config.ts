import { defineConfig } from "vite";
import { minify } from "shader-minifier-wasm";

const mode = process.env.NODE_ENV;
const isProd = mode === "production";

function glslMinifyPlugin() {
  return {
    name: "vite-plugin-glsl-minify",

    async transform(code: string, id: string) {
      if (!id.endsWith(".glsl")) return null;

      const mini = isProd ? await minify({ code }, { format: "text" }) : code;

      return {
        code: `export default ${JSON.stringify(mini)};`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  base: "/webvtables/",
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
  plugins: [glslMinifyPlugin()],
});
