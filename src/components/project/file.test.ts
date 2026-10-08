// Run: npx -y tsx src/components/project/file.test.ts
import { dedupe, format, pack, parse, unpack, type Project } from "./file.ts";

const ok = (c: boolean, m: string) => {
  if (!c) throw new Error(m);
};
const bytes = (...v: number[]) => Uint8Array.from(v);
const audio = { Typ: "sampl_pts", Mod: "time", Win: "999999999999", Str: "0", Frm: "auto", Rsm: "nearest", Nam: "a [1].wav" };
const node = (id: string, asset: string, spec: Record<string, string>) => ({ id, kind: "data", params: [0.5], x: 1, y: 2, flags: 0, asset, spec });

// two Data nodes with identical files + one different -> two assets, nodes share an id
const p: Project = {
  nodes: [node("0x00000000001", "0xaaaaa", audio), node("0x00000000002", "0xbbbbb", { ...audio, Nam: "copy.wav" }), node("0x00000000003", "0xccccc", { Typ: "pixels", Mod: "spectral", Crp: "0 0 4 4", Frm: "7", Rsm: "area" })],
  links: [],
  lanes: [],
  assets: [
    { id: "0xaaaaa", data: bytes(1, 2, 3) },
    { id: "0xbbbbb", data: bytes(1, 2, 3) },
    { id: "0xccccc", data: bytes(9, 9) },
  ],
};
await dedupe(p);
ok(p.assets.length === 2, "duplicates merged");
ok(p.nodes[0].asset === "0xaaaaa" && p.nodes[1].asset === "0xaaaaa" && p.nodes[2].asset === "0xccccc", "nodes repointed");

// spec lines: aligned box rows, no asset bytes in the text
const text = format(p);
ok(text.includes("[ Typ: sampl_pts    ]\n"), "Typ row");
ok(text.includes("[ Win: 999999999999 ]\n"), "Win row");
ok(!/\x01|DATA/.test(text), "no data in text");

// zip round trip keeps originals and every spec value (names with ] included)
const q = unpack(pack(p));
ok(q.assets.length === 2 && q.assets.find((a) => a.id === "0xaaaaa")!.data.join() === "1,2,3", "asset bytes");
ok(JSON.stringify(q.nodes[0].spec) === JSON.stringify(audio), "audio spec");
ok(q.nodes[1].spec!.Nam === "copy.wav" && q.nodes[2].spec!.Crp === "0 0 4 4", "other specs");

// a plain .wtp with a Data node must say it needs the zip
let msg = "";
try {
  parse(text);
} catch (e) {
  msg = (e as Error).message;
}
ok(/\.wtx/.test(msg), `plain parse error: ${msg}`);
console.log("file ok");
