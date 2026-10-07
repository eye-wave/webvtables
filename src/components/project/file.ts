import { FRAME, MAX_FRAMES } from "../../wasm/wav";

export type Node = {
  id: string;
  kind: string;
  params: number[];
  x: number;
  y: number;
  flags: number;
  asset?: string; // Data nodes: id of the frames stored in `assets`
};
export const FLAGS = ["norm", "remdc", "clip"];
export type Lane = {
  name: string;
  type: "P" | "L" | "C" | "S";
  targets: { id: string; j: number }[];
  lfo: number[];
  keys: { t: number; v: number; c?: number }[];
};
export type Project = {
  nodes: Node[];
  links: [string, number, string, number][];
  lanes: Lane[];
  assets: { id: string; data: Float32Array }[];
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

// Frames <-> base64: UTF-8-safe and avoids parser prefixes.
// Host-endian floats; browsers are little-endian.
const b64 = (a: Float32Array) => {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000)
    s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => {
  const t = atob(s); // throws on bad input
  const u = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
  return new Float32Array(u.buffer); // throws unless a whole number of floats
};

export function format(p: Project): string {
  const node = (n: Node) => {
    const row = (s: string) => `| ${s.padEnd(17)} |`;
    const c = (s: string, pre: number) =>
      `|${" ".repeat(pre)}${s}${" ".repeat(19 - pre - s.length)}|`;
    return [
      "_".repeat(21),
      c(n.id, 3),
      c(n.kind.padEnd(8), 5),
      ...(n.asset ? [`[    { ${n.asset} }    ]`] : []),
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
      ...p.assets.map(
        (a) =>
          `${a.id}:DATA\n${b64(a.data)
            .match(/.{1,76}/g)!
            .join("\n")}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}

const NUM = "(-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)";
const RE = {
  asset: /^(0x[0-9a-f]{5}):DATA$/i,
  ref: /^\[\s*\{\s*(0x[0-9a-f]{5})\s*\}\s*\]$/i,
  link: /^(0x[0-9a-f]+):(\d+)\s*->\s*(0x[0-9a-f]+):(\d+)$/i,
  title: /^=\s(.*?)\s*([PLCS])\s=$/,
  target: /^=\s*(0x[0-9a-f]+)\[(\d+)\]\s*=$/i,
  cur: new RegExp(`^=\\s*cur\\s*${NUM}\\s*=$`, "i"),
  key: new RegExp(`^=\\s*<(\\d+)>\\s*${NUM}\\s*=$`, "i"),
  lfo: new RegExp(`^:\\s*([A-Z]{3})\\s*-\\s*${NUM}\\s*:$`),
  cell: /^\|\s*(.*?)\s*\|$/,
  pos: new RegExp(`^([xy]):\\s*${NUM}$`, "i"),
  num: new RegExp(`^${NUM}$`, "i"),
};

export function parse(text: string): Project {
  const p: Project = { nodes: [], links: [], lanes: [], assets: [] };
  let n: Node | undefined,
    id = false;
  let l: Lane | undefined;
  const blobs: { id: string; b64: string }[] = [];
  let a: (typeof blobs)[number] | undefined;
  text.split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim();
    const bad = () => {
      throw new Error(`line ${i + 1}: ${raw.slice(0, 40)}`);
    };
    let m: RegExpMatchArray | null;
    if (a) {
      if (s) return void (a.b64 += s);
      a = undefined; // a blank line ends the asset
    }
    if (!s) return;
    if (s[0] === "_") {
      p.nodes.push(
        (n = { id: "", kind: "", params: [], x: 0, y: 0, flags: 0 }),
      );
      id = false;
      l = undefined;
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
    } else if ((m = RE.asset.exec(s))) {
      n = undefined;
      l = undefined;
      const aid = m[1].toLowerCase();
      if (blobs.some((b) => b.id === aid)) return bad();
      blobs.push((a = { id: aid, b64: "" }));
    } else if (s[0] === "[") {
      const r = RE.ref.exec(s);
      if (!r || !n?.kind || n.asset) return bad();
      n.asset = r[1].toLowerCase();
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
  for (const b of blobs) {
    let data: Float32Array | undefined;
    try {
      data = unb64(b.b64);
    } catch {}
    const frames = (data?.length ?? 0) / FRAME;
    if (!data || !Number.isInteger(frames) || frames < 1 || frames > MAX_FRAMES)
      throw new Error(
        `asset ${b.id}: need 1-${MAX_FRAMES} whole frames of data`,
      );
    p.assets.push({ id: b.id, data });
  }
  const orphan = p.nodes.find(
    (x) => x.asset && !p.assets.some((a) => a.id === x.asset),
  );
  if (orphan) throw new Error(`node ${orphan.id} uses a missing asset`);
  if (p.nodes.some((x) => !x.id || !x.kind))
    throw new Error("node box without id or kind");
  return p;
}
