import { marked } from "marked";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Plugin } from "vite";

// `x.md?url` -> a compiled x.html asset, fetched at runtime. <md-*> tags pass through as-is for Solid to mount into.
export default function md(): Plugin {
  let dev = false;
  return {
    name: "md",
    enforce: "pre",
    // the compiled guides get their own folder; every other asset keeps vite's default name
    config: () => ({
      build: {
        rolldownOptions: {
          output: {
            assetFileNames: (a) =>
              `assets/${a.names.some((n) => n.endsWith(".html")) ? "docs/" : ""}[name]-[hash][extname]`,
          },
        },
      },
    }),
    configResolved: (c) => void (dev = c.command === "serve"),
    load: {
      filter: { id: /\.md\?url$/ },
      handler(id) {
        const file = id.slice(0, -4);
        this.addWatchFile(file);
        const html = (marked.parse(readFileSync(file, "utf8")) as string)
          // html has no self-closing custom elements: <md-x /> would swallow what follows
          .replace(/<(md-[\w-]+)([^>]*?)\s*\/>/g, "<$1$2></$1>")
          // a lone <md-x></md-x> line isn't a block to markdown; drop the <p> it gets wrapped in
          .replace(/<p>(<md-[\w-]+[^>]*><\/md-[\w-]+>)<\/p>/g, "$1")
          // <md-demo> attributes are written as JS literals ({ Shape: "Sine" }, may span lines) and shipped as JSON;
          // a typo fails the build here
          .replace(/<md-demo\b[^>]*>/g, (tag) =>
            tag.replace(
              /(\w+)='([^']*)'/g,
              (_, k, v) =>
                `${k}='${JSON.stringify(new Function(`return (${v})`)()).replaceAll("'", "&#39;")}'`,
            ),
          );
        if (dev)
          return `export default ${JSON.stringify("data:text/html;charset=utf-8," + encodeURIComponent(html))}`;
        const ref = this.emitFile({
          type: "asset",
          name: basename(file, ".md") + ".html",
          source: html,
        });
        return `export default "__VITE_ASSET__${ref}__"`;
      },
    },
  };
}
