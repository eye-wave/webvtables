import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import type { Plugin } from "vite";

export default function mdx(): Plugin {
  return {
    name: "mdx",
    enforce: "pre",
    transform: {
      filter: { id: /\.mdx$/ },
      async handler(code, id) {
        const file = await compile(
          { value: code, path: id },
          { jsxImportSource: "solid-jsx", remarkPlugins: [remarkGfm] },
        );
        return { code: String(file.value), map: null };
      },
    },
  };
}
