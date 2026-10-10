import type { Zippable } from "fflate";

const fflate = () => import("fflate");

export type Node = {
  id: string;
  kind: string;
  params: number[];
  x: number;
  y: number;
  flags: number; // bit 0 norm, bit 1 remdc, bit 2 clip
  asset?: string; // Data/Math nodes: id of the original file in `assets`
  spec?: Record<string, string>; // Data nodes: settings, 3-letter keys (see LONG)
};
export type Lane = {
  name: string;
  type: "P" | "L" | "C" | "S" | "R";
  targets: { id: string; j: number }[];
  lfo: number[]; // L: shape, phase, amp, freq, skew, dc offset. R: seed, freq, type, amp, phase, dc
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

const f15 = (v: number) => v.toFixed(15);
const p15 = (v: number) => v.toFixed(13).slice(0, 15).padEnd(15, "0"); // exactly 15 chars
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

// Math LaTeX is written inline in the .wtp, so only the other assets need a zip.
const zipped = (p: Project) =>
  p.assets.filter(
    (a) => !p.nodes.some((n) => n.asset === a.id && n.kind === "math"),
  );
export const needsZip = (p: Project) => zipped(p).length > 0;

export async function pack(p: Project) {
  const { strToU8, zipSync } = await fflate();
  const files: Zippable = { [MAIN]: strToU8(format(p)) };
  for (const a of zipped(p)) files[DIR + a.id] = [a.data, { level: 0 }]; // already compressed audio/images: just store
  return zipSync(files) as Uint8Array<ArrayBuffer>; // fflate allocates plain ArrayBuffers
}

export async function unpack(zip: Uint8Array): Promise<Project> {
  const { strFromU8, unzipSync } = await fflate();
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

// ---- the .wtp text format -------------------------------------------------------------------
// Blocks are separated by blank lines; nodes are 21 columns wide, lanes 23.
//
//   [=- 0x471dd9900e7 -=]      node id
//   | _shapes_ 0 &null  |      kind (8 wide, centered in _), flags 0-7, asset id (5 hex) or null (Math has none)
//   | 1.000000000000000 |      params
//   |< *extern Data    >| &…   nodes with an asset: Data settings as JSON, Math LaTeX as is
//   |=x -293.0000000000=|      position
//   \=y 182.00000000000=/
//
//   0x471dd9900e7:0 -> 0x4a77abc5d17:0       link: node:output -> node:input
//
//   -/...................\-
//   . [Shift----------] f .    lane: name (15 wide, padded with -), f lfo / r random / P points / S spectral / C crossfade
//   .> 0x4a77abc5d17[0] <.     target: node[param]
//   .= 0.000000000000000 =.    f: shape, phase, amp, freq, skew, dc offset. r: seed, freq, type, amp, phase, dc
//   .##0 0.346153855323792.    keys (P S C): frame (3 wide, padded with #) and value
//   .cur 0.346153855323792.    curve of the key above, when not 0.5
//   -\.................../-
//
//   <- group "Group 1" 1 ->    name as a JSON string, mode only when not 0
//   0xd04d5dfbe42              one member id per line
//   <- group ->

// Data settings: file key <-> the 3-letter key the Data node uses. Unknown keys pass through.
const LONG: Record<string, string> = {
  Typ: "type",
  Mod: "mode",
  Crp: "crop",
  Frm: "frames",
  Rsm: "resample",
  Nam: "name",
};
const SHORT = Object.fromEntries(Object.entries(LONG).map(([k, v]) => [v, k]));

// crop is a list of numbers and frames a number (or "auto"); everything else stays text
const specToJson = (s: Record<string, string>) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(s).map(([k, v]) => [
        LONG[k] ?? k,
        k === "Crp"
          ? v
              .split(/[\s,]+/)
              .filter(Boolean)
              .map(Number)
          : k === "Frm" && v !== "auto"
            ? +v
            : v,
      ]),
    ),
  );

const specFromJson = (json: string): Record<string, string> => {
  const o = JSON.parse(json);
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error();
  return Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      SHORT[k] ?? k,
      Array.isArray(v) ? v.join(" ") : String(v),
    ]),
  );
};

// ---- lexer: one token per line ---------------------------------------------------------------
enum Tok {
  NodeHead,
  NodeKind,
  Param,
  Extern,
  PosX,
  PosY,
  Link,
  LaneTop,
  LaneName,
  LaneTarget,
  LaneValue,
  LaneKey,
  LaneCurve,
  LaneEnd,
  GroupOpen,
  GroupNode,
  GroupEnd,
}

type Token = { tok: Tok; m: RegExpExecArray; line: number };

const NUM = "(-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)";
const ID = "(0x[0-9a-f]+)";
const re = (s: string) => new RegExp(s, "i");

// First match wins. Each pattern is the whole (trimmed) line.
const RULES: [Tok, RegExp][] = [
  [Tok.NodeHead, re(`^\\[=-\\s*${ID}\\s*-=\\]$`)],
  [Tok.NodeKind, re("^\\|\\s(\\S+)\\s([0-7])\\s&([0-9a-f]{5}|null)\\s*\\|$")],
  [Tok.Param, re(`^\\|\\s*${NUM}\\s*\\|$`)],
  [Tok.Extern, re("^\\|<\\s\\*extern\\sData\\s*>\\|(?:\\s&(.*))?$")],
  [Tok.PosX, re(`^\\|=x\\s*${NUM}\\s*=\\|$`)],
  [Tok.PosY, re(`^\\\\=y\\s*${NUM}\\s*=/$`)],
  [Tok.Link, re(`^${ID}:(\\d+)\\s*->\\s*${ID}:(\\d+)$`)],
  [Tok.LaneTop, re("^-/\\.+\\\\-$")],
  [Tok.LaneName, re("^\\.\\s\\[(.*)\\]\\s([fPSCr])\\s\\.$")],
  [Tok.LaneTarget, re(`^\\.>\\s*${ID}\\[(\\d+)\\]\\s*<\\.$`)],
  [Tok.LaneValue, re(`^\\.=\\s*${NUM}\\s*=\\.$`)],
  [Tok.LaneKey, re(`^\\.([#\\d]{3,})\\s+${NUM}\\.$`)],
  [Tok.LaneCurve, re(`^\\.cur\\s+${NUM}\\.$`)],
  [Tok.LaneEnd, re("^-\\\\\\.+/-$")],
  [
    Tok.GroupOpen,
    re('^<-\\sgroup\\s("(?:[^"\\\\]|\\\\.)*")(?:\\s([12]))?\\s->$'),
  ],
  [Tok.GroupNode, re(`^${ID}$`)],
  [Tok.GroupEnd, re("^<-\\sgroup\\s->$")],
];

function lex(text: string): Token[] {
  const out: Token[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim();
    if (!s) return;
    for (const [tok, rule] of RULES) {
      const m = rule.exec(s);
      if (m) {
        out.push({ tok, m, line: i + 1 });
        return;
      }
    }
    throw new Error(`line ${i + 1}: ${raw.slice(0, 40)}`);
  });
  return out;
}

// ---- parser: node = head kind param* [extern] x y; lane = top name (target|value|key|curve)* end ----
const names = (want: Tok[]) => want.map((t) => Tok[t]).join(" or ");
const bad = (t: Token, why: string) => new Error(`line ${t.line}: ${why}`);

// `load` supplies asset data (from a .wtx); without it any Data node reference is an error.
export function parse(
  text: string,
  load?: (id: string) => Uint8Array | undefined,
): Project {
  const toks = lex(text);
  const p: Project = {
    nodes: [],
    links: [],
    lanes: [],
    groups: [],
    assets: [],
  };
  const tex = new Map<string, string>(); // Math asset id -> its LaTeX
  let at = 0;

  const peek = () => toks[at]?.tok;
  const next = (...want: Tok[]) => {
    const t = toks[at++];
    if (!t) throw new Error(`unexpected end of file, expected ${names(want)}`);
    if (!want.includes(t.tok))
      throw bad(t, `expected ${names(want)}, got ${Tok[t.tok]}`);
    return t;
  };

  const node = (): Node => {
    const head = next(Tok.NodeHead);
    const kind = next(Tok.NodeKind);
    const n: Node = {
      id: head.m[1].toLowerCase(),
      kind: kind.m[1].replace(/^_+|_+$/g, ""),
      flags: +kind.m[2],
      asset: kind.m[3] === "null" ? undefined : "0x" + kind.m[3].toLowerCase(),
      params: [],
      x: 0,
      y: 0,
    };
    while (peek() === Tok.Param) n.params.push(+next(Tok.Param).m[1]);
    if (peek() === Tok.Extern) {
      const t = next(Tok.Extern);
      const tail = t.m[1] ?? "";
      if (n.kind === "math") {
        n.asset ??= n.id; // internal only: the LaTeX is inline, node ids never clash with 5-digit asset ids
        tex.set(n.asset, tail);
      } else if (!n.asset) {
        throw bad(t, "extern line on a node without an asset id");
      } else if (tail) {
        try {
          n.spec = specFromJson(tail);
        } catch {
          throw bad(t, "settings are not a JSON object");
        }
      }
    }
    n.x = +next(Tok.PosX).m[1];
    n.y = +next(Tok.PosY).m[1];
    return n;
  };

  const lane = (): Lane => {
    next(Tok.LaneTop);
    const head = next(Tok.LaneName);
    const l: Lane = {
      name: head.m[1].replace(/-+$/, ""),
      type:
        head.m[2] === "f"
          ? "L"
          : head.m[2] === "r"
            ? "R"
            : (head.m[2] as Lane["type"]),
      targets: [],
      lfo: [],
      keys: [],
    };
    const lfo = l.type === "L" || l.type === "R"; // lanes with values instead of keys
    for (;;) {
      const t = next(
        Tok.LaneTarget,
        Tok.LaneValue,
        Tok.LaneKey,
        Tok.LaneCurve,
        Tok.LaneEnd,
      );
      switch (t.tok) {
        case Tok.LaneTarget:
          l.targets.push({ id: t.m[1].toLowerCase(), j: +t.m[2] });
          break;
        case Tok.LaneValue:
          if (!lfo) throw bad(t, "value in a lane that is not f or r");
          l.lfo.push(+t.m[1]);
          break;
        case Tok.LaneKey:
          if (lfo) throw bad(t, "key in an f or r lane");
          l.keys.push({ t: +t.m[1].replaceAll("#", ""), v: +t.m[2] });
          break;
        case Tok.LaneCurve:
          if (!l.keys.length) throw bad(t, "cur before any key");
          l.keys[l.keys.length - 1].c = +t.m[1];
          break;
        case Tok.LaneEnd:
          return l;
      }
    }
  };

  const group = (): Group => {
    const t = next(Tok.GroupOpen);
    const g: Group = {
      name: JSON.parse(t.m[1]),
      mode: +(t.m[2] ?? 0),
      nodes: [],
    };
    while (peek() === Tok.GroupNode)
      g.nodes.push(next(Tok.GroupNode).m[1].toLowerCase());
    next(Tok.GroupEnd);
    return g;
  };

  while (at < toks.length) {
    switch (peek()) {
      case Tok.NodeHead:
        p.nodes.push(node());
        break;
      case Tok.Link: {
        const { m } = next(Tok.Link);
        p.links.push([m[1].toLowerCase(), +m[2], m[3].toLowerCase(), +m[4]]);
        break;
      }
      case Tok.LaneTop:
        p.lanes.push(lane());
        break;
      case Tok.GroupOpen:
        p.groups.push(group());
        break;
      default:
        next(Tok.NodeHead, Tok.Link, Tok.LaneTop, Tok.GroupOpen); // throws
    }
  }

  for (const id of new Set(p.nodes.flatMap((x) => x.asset ?? []))) {
    const x = p.nodes.find((x) => x.asset === id)!;
    const data =
      x.kind === "math"
        ? new TextEncoder().encode(tex.get(id) ?? "")
        : load?.(id);
    if (!data)
      throw new Error(
        `node ${x.id} uses a missing asset${load ? "" : ` (needs a ${EXT_ZIP} file)`}`,
      );
    p.assets.push({ id, data });
  }
  return p;
}

// ---- writer ------------------------------------------------------------------------------------
const center = (s: string) => {
  const pad = Math.max(0, 8 - s.length),
    left = pad >> 1;
  return "_".repeat(left) + s + "_".repeat(pad - left);
};

export function format(p: Project): string {
  const text = (id?: string) =>
    new TextDecoder()
      .decode(p.assets.find((a) => a.id === id)?.data)
      .replace(/[\r\n]+/g, " ")
      .trim();

  const node = (n: Node) => {
    const tail =
      n.kind === "math"
        ? text(n.asset)
        : n.spec && Object.keys(n.spec).length
          ? specToJson(n.spec)
          : "";
    return [
      `[=- ${n.id} -=]`,
      `| ${center(n.kind)} ${n.flags & 7} ${("&" + (n.kind === "math" || !n.asset ? "null" : n.asset.slice(2))).padEnd(6)} |`,
      ...n.params.map((v) => `| ${f15(v)} |`),
      ...(n.asset ? [`|< *extern Data    >|${tail && ` &${tail}`}`] : []),
      `|=x ${p15(n.x)}=|`,
      `\\=y ${p15(n.y)}=/`,
    ].join("\n");
  };

  const lane = (l: Lane) =>
    [
      `-/${".".repeat(19)}\\-`,
      `. [${l.name.slice(0, 15).padEnd(15, "-")}] ${l.type === "L" ? "f" : l.type === "R" ? "r" : l.type} .`,
      ...l.targets.map((t) => `.> ${`${t.id}[${t.j}]`.padEnd(17)} <.`),
      ...(l.type === "L" || l.type === "R"
        ? Array.from(l.lfo, (v) => `.= ${f15(v ?? 0)} =.`)
        : l.keys.flatMap((k) => [
            `.${String(k.t).padStart(3, "#")} ${f15(k.v)}.`,
            ...(k.c === undefined || k.c === 0.5 ? [] : [`.cur ${f15(k.c)}.`]),
          ])),
      `-\\${".".repeat(19)}/-`,
    ].join("\n");

  const group = (g: Group) =>
    [
      `<- group ${JSON.stringify(g.name)}${g.mode ? ` ${g.mode}` : ""} ->`,
      ...g.nodes,
      "<- group ->",
    ].join("\n");

  // a link is written right after the later of its two nodes
  const index = new Map(p.nodes.map((n, i) => [n.id, i]));
  return (
    [
      ...p.nodes.flatMap((n, i) => [
        node(n),
        p.links
          .filter(([a, , b]) => Math.max(index.get(a)!, index.get(b)!) === i)
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
