import katex from "katex";
import { marked } from "marked";
import { codeToHtml } from "shiki";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { Plugin } from "vite";

async function lookup(from: string, attrs: string) {
  const rel = /src=["']([^"']+)["']/.exec(attrs)?.[1];
  if (!rel) throw new Error(`<md-lookup ${attrs}> needs src="path/to/file.rs"`);
  const path = resolve(dirname(from), rel);
  const file = readFileSync(path, "utf8");

  const html = await codeToHtml(file, { lang: "rust", theme: "github-dark" });
  return { path, html: `<md-lookup>${html}</md-lookup>` };
}
const LOOKUP = /<md-lookup\s+([^>]*?)\s*(?:\/>|><\/md-lookup>)/g;

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
      async handler(id) {
        const file = id.slice(0, -4);
        this.addWatchFile(file);
        const text = readFileSync(file, "utf8");
        // md-lookup blocks (highlighting is async) are parked behind placeholders too, on their own paragraph
        const looked = await Promise.all(
          [...text.matchAll(LOOKUP)].map(([, a]) => lookup(file, a)),
        );
        looked.forEach((l) => this.addWatchFile(l.path));
        let n = 0;
        const parked = text.replace(LOOKUP, () => `\n\n@@code${n++}@@\n\n`);
        // <md-latex>m_a</md-latex> becomes MathML right here (no katex css, fonts or runtime; bad TeX fails the build).
        // It is parked behind a placeholder so markdown can't touch the TeX (m_a ... m_b is not emphasis).
        const math: string[] = [];
        const tex = parked.replace(
          /<md-latex>([\s\S]*?)<\/md-latex>/g,
          (_, t) =>
            `@@math${math.push(katex.renderToString(t.trim(), { output: "mathml" })) - 1}@@`,
        );
        // a line holding only an <md-*> tag gets blank lines around it, or markdown stops at the html block
        const src = tex.replace(
          /^[ \t]*(<\/?md-[\w-]+[^>]*>)[ \t]*\r?$/gm,
          "\n$1\n",
        );
        const html = (marked.parse(src) as string)
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
          )
          .replaceAll("<a ", '<a target="_blank" ')
          .replace(/@@math(\d+)@@/g, (_, i) => math[+i])
          // a plain space right after the math is lost on screen (the text sticks to the formula), so keep it as nbsp
          .replace(/(<\/math><\/span>) (?=[^\s<])/g, "$1&nbsp;")
          .replace(
            /(?:<p>)?@@code(\d+)@@(?:<\/p>)?/g,
            (_, i) => looked[+i].html,
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
