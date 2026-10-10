import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export type Node = {
  id: string;
  kind: string;
  params: number[];
  x: number;
  y: number;
  flags: number;
  asset?: string; // Data nodes: id of the original file in `assets`
  spec?: Record<string, string>; // Data nodes: settings, `[ Key: value ]` lines (3-letter keys)
};
export const FLAGS = ["norm", "remdc", "clip"];
export type Lane = {
  name: string;
  type: "P" | "L" | "C" | "S";
  targets: { id: string; j: number }[];
  lfo: number[];
  keys: { t: number; v: number; c?: number }[];
};
// Visual only: a name, how it is shown (0 expanded, 1 params, 2 name only) and its nodes by id.
export type Group = { name: string; mode: number; nodes: string[] };
export type Project = {
  nodes: Node[];
  links: [string, number, string, number][];
  lanes: Lane[];
  groups: Group[];
  assets: { id: string; data: Uint8Array }[]; // original files, not rendered frames
};

export const LFO_NAMES = ["SHP", "PHS", "AMP", "FRQ", "SKW", "DCF"];

const f15 = (v: number) => v.toFixed(15);
const f14 = (v: number) => v.toFixed(13).slice(0, 14).padEnd(14, "0");
const randId = (used: Set<string>, bits: number) => {
  let id: string;
  do
    id =
      "0x" +
      Math.floor(Math.random() * 2 ** bits)
        .toString(16)
        .padStart(bits / 4, "0");
  while (used.has(id));
  used.add(id);
  return id;
};

// bits: 44 -> 0x + 11 hex digits (nodes), 20 -> 5 (assets)
export function newIds(n: number, bits = 44) {
  const used = new Set<string>();
  return Array.from({ length: n }, () => randId(used, bits));
}

// Assets are the original imported files, stored as they came, one per hex id in a .wtx.
export const EXT = ".wtp"; // text: graph, params, keyframes
export const EXT_ZIP = ".wtx"; // zip: project.wtp + assets/<id> for projects with Data nodes
const MAIN = `project${EXT}`,
  DIR = "assets/";

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

// Merges assets with identical bytes (by SHA-256), pointing every node at the one kept.
// Needs a secure context (crypto.subtle); throws before changing anything otherwise.
export async function dedupe(p: Project) {
  const sums = await Promise.all(
    p.assets.map(async (a) =>
      hex(
        await crypto.subtle.digest(
          "SHA-256",
          a.data as Uint8Array<ArrayBuffer>,
        ),
      ),
    ),
  );
  const first = new Map<string, string>();
  const alias = new Map<string, string>();
  p.assets = p.assets.filter((a, i) => {
    const id = first.get(sums[i]);
    if (id) alias.set(a.id, id);
    else first.set(sums[i], a.id);
    return !id;
  });
  for (const n of p.nodes) if (n.asset) n.asset = alias.get(n.asset) ?? n.asset;
}

export function pack(p: Project) {
  const files: Zippable = { [MAIN]: strToU8(format(p)) };
  for (const a of p.assets) files[DIR + a.id] = [a.data, { level: 0 }]; // already compressed audio/images: just store
  return zipSync(files) as Uint8Array<ArrayBuffer>; // fflate allocates plain ArrayBuffers
}

export function unpack(zip: Uint8Array): Project {
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new Error("not a zip file");
  }
  if (!files[MAIN]) throw new Error(`no ${MAIN} inside`);
  return parse(strFromU8(files[MAIN]), (id) => {
    const u = files[DIR + id];
    return u?.length ? u : undefined;
  });
}

export function format(p: Project): string {
  const node = (n: Node) => {
    const row = (s: string) => `| ${s.padEnd(17)} |`;
    const c = (s: string, pre: number) =>
      `|${" ".repeat(pre)}${s}${" ".repeat(19 - pre - s.length)}|`;
    return [
      "_".repeat(21),
      c(n.id, 3),
      c(n.kind.padEnd(8), 5),
      ...(n.asset
        ? [
            `[    { ${n.asset} }    ]`,
            ...Object.entries(n.spec ?? {})
              .filter(([k]) => /^[A-Za-z]{3}$/.test(k))
              .map(([k, v]) => {
                // a value that fits the box goes inside it; a longer one leaves a `*` and
                // trails the box, so the rows stay 21 wide
                v = v.replace(/[\r\n]+/g, " ").trim();
                return v.length <= 12
                  ? `[ ${k}: ${v.padEnd(12)} ]`
                  : `[ ${(k + "*").padEnd(18)}] &( ${v} )`;
              }),
          ]
        : []),
      c("", 0),
      c(
        FLAGS.map((f, i) => ((n.flags >> i) & 1 ? f.toUpperCase() : f)).join(
          " ",
        ),
        2,
      ),
      "#" + "-".repeat(19) + "#",
      ...n.params.map((v) => row(f15(v))),
      ...(n.params.length ? ["#" + "-".repeat(19) + "#"] : []),
      row(`x: ${f14(n.x)}`),
      row(`y: ${f14(n.y)}`),
      "#" + "-".repeat(19) + "#",
    ].join("\n");
  };
  const eq = (s: string, ch = "=") => `${ch} ${s.padEnd(24)}${ch}`;
  const dash = "-".repeat(27);

  const lane = (l: Lane) =>
    [
      [`= ${l.name.padEnd(22)}${l.type} =`],
      l.targets.map((t) => eq(`${t.id}[${t.j}]`)),
      l.type === "L"
        ? l.lfo.map((v, i) => `: ${LFO_NAMES[i]} - ${f15(v)} :`)
        : [],
      l.keys.flatMap((k) => [
        `= ${`<${k.t}>`.padStart(5)} ${f15(k.v)} =`,
        ...(k.c === undefined || k.c === 0.5 ? [] : [`=   cur ${f15(k.c)} =`]),
      ]),
    ]
      .filter((sec) => sec.length)
      .flatMap((sec) => [dash, ...sec])
      .concat(dash)
      .join("\n");
  const group = (g: Group) =>
    [
      `@ ${g.name.padEnd(22)} ${g.mode} @`,
      ...g.nodes.map((id) => `@ ${id.padEnd(22)} @`),
    ].join("\n");
  const at = (id: string) => p.nodes.findIndex((n) => n.id === id);
  return (
    [
      ...p.nodes.flatMap((n, i) => [
        node(n),
        p.links
          .filter(([a, , b]) => Math.max(at(a), at(b)) === i)
          .map(([a, sa, b, sb]) => `${a}:${sa} -> ${b}:${sb}`)
          .join("\n"),
      ]),
      ...p.lanes.map(lane),
      ...p.groups.map(group),
    ]
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}

const NUM = "(-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)";
const RE = {
  ref: /^\[\s*\{\s*(0x[0-9a-f]{5})\s*\}\s*\]$/i,
  spec: /^\[\s*([A-Za-z]{3}):\s*(.*?)\s*\]$/,
  big: /^\[\s*([A-Za-z]{3})\*\s*\]\s*&\(\s*(.*?)\s*\)$/,
  link: /^(0x[0-9a-f]+):(\d+)\s*->\s*(0x[0-9a-f]+):(\d+)$/i,
  title: /^=\s(.*?)\s*([PLCS])\s=$/,
  gtitle: /^@\s(.*?)\s+([012])\s@$/,
  gnode: /^@\s*(0x[0-9a-f]+)\s*@$/i,
  target: /^=\s*(0x[0-9a-f]+)\[(\d+)\]\s*=$/i,
  cur: new RegExp(`^=\\s*cur\\s*${NUM}\\s*=$`, "i"),
  key: new RegExp(`^=\\s*<(\\d+)>\\s*${NUM}\\s*=$`, "i"),
  lfo: new RegExp(`^:\\s*([A-Z]{3})\\s*-\\s*${NUM}\\s*:$`),
  cell: /^\|\s*(.*?)\s*\|$/,
  pos: new RegExp(`^([xy]):\\s*${NUM}$`, "i"),
  num: new RegExp(`^${NUM}$`, "i"),
};

// `load` supplies asset data (from a .wtx); without it any Data node reference is an error.
export function parse(
  text: string,
  load?: (id: string) => Uint8Array | undefined,
): Project {
  const p: Project = { nodes: [], links: [], lanes: [], groups: [], assets: [] };
  let n: Node | undefined,
    id = false;
  let l: Lane | undefined;
  let gr: Group | undefined;
  text.split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim();
    const bad = () => {
      throw new Error(`line ${i + 1}: ${raw.slice(0, 40)}`);
    };
    let m: RegExpMatchArray | null;
    if (!s) return;
    if (s[0] === "_") {
      p.nodes.push(
        (n = { id: "", kind: "", params: [], x: 0, y: 0, flags: 0 }),
      );
      id = false;
      l = gr = undefined;
    } else if (s[0] === "@") {
      n = l = undefined;
      if ((m = RE.gtitle.exec(s)))
        p.groups.push((gr = { name: m[1].trim(), mode: +m[2], nodes: [] }));
      else if (gr && (m = RE.gnode.exec(s))) gr.nodes.push(m[1].toLowerCase());
      else bad();
    } else if (s[0] === "#") {
      if (!n) bad();
    } else if (s[0] === "|") {
      const c = RE.cell.exec(s)?.[1];
      if (c === undefined || !n) return bad();
      if (!c) return;
      if (/^0x[0-9a-f]+$/i.test(c) && !id)
        ((n.id = c.toLowerCase()), (id = true));
      else if ((m = RE.pos.exec(c))) n[m[1].toLowerCase() as "x" | "y"] = +m[2];
      else if ((m = RE.num.exec(c))) n.params.push(+m[1]);
      else if (!n.kind && /^\w+$/.test(c)) n.kind = c;
      else if (
        n.kind &&
        c.split(/\s+/).every((w) => FLAGS.includes(w.toLowerCase()))
      ) {
        for (const w of c.split(/\s+/))
          if (w === w.toUpperCase())
            n.flags |= 1 << FLAGS.indexOf(w.toLowerCase());
      } else bad();
    } else if (s[0] === "[") {
      if (!n?.kind) return bad();
      if ((m = RE.ref.exec(s))) {
        if (n.asset) return bad();
        n.asset = m[1].toLowerCase();
      } else if ((m = RE.spec.exec(s) ?? RE.big.exec(s))) {
        // keys are unique per node; values are interpreted by the Data node itself
        if (!n.asset || m[1] in (n.spec ??= {})) return bad();
        n.spec[m[1]] = m[2];
      } else bad();
    } else if ((m = RE.link.exec(s))) {
      n = undefined;
      p.links.push([m[1].toLowerCase(), +m[2], m[3].toLowerCase(), +m[4]]);
    } else if (s[0] === "-") {
      if (!/^-+$/.test(s)) bad();
    } else if ((m = RE.title.exec(s))) {
      n = undefined;
      p.lanes.push(
        (l = {
          name: m[1],
          type: m[2] as Lane["type"],
          targets: [],
          lfo: [],
          keys: [],
        }),
      );
    } else if (!l) bad();
    else if ((m = RE.target.exec(s)))
      l.targets.push({ id: m[1].toLowerCase(), j: +m[2] });
    else if ((m = RE.key.exec(s))) l.keys.push({ t: +m[1], v: +m[2] });
    else if ((m = RE.cur.exec(s))) {
      if (!l.keys.length) bad();
      l.keys[l.keys.length - 1].c = +m[1];
    } else if ((m = RE.lfo.exec(s))) {
      const j = LFO_NAMES.indexOf(m[1]);
      if (j < 0) bad();
      l.lfo[j] = +m[2];
    } else bad();
  });
  for (const id of new Set(p.nodes.flatMap((x) => x.asset ?? []))) {
    const data = load?.(id);
    if (!data) {
      const x = p.nodes.find((x) => x.asset === id)!;
      throw new Error(
        `node ${x.id} uses a missing asset${load ? "" : ` (needs a ${EXT_ZIP} file)`}`,
      );
    }
    p.assets.push({ id, data });
  }
  if (p.nodes.some((x) => !x.id || !x.kind))
    throw new Error("node box without id or kind");
  return p;
}
