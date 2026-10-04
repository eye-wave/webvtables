import type { WasmExports } from "../wasm";

export type LaneView = {
  name: string;
  lfo?: number[];
  mode?: number; // points lanes: 1 crossfade, 2 spectral
  keys: { t: number; v: number; c: number }[];
  addrs: number[];
  curve: Float32Array;
};

const NAME_MAX = 48;
const utf8 = new TextDecoder();
const enc = new TextEncoder();

export function createKf(w: WasmExports) {
  const f32 = (ptr: number, n: number) =>
    new Float32Array(w.memory.buffer, ptr, n).slice();
  const name = (l: number) => {
    const n = w.lane_name(l);
    return utf8.decode(new Uint8Array(w.memory.buffer, w.lane_name_ptr(), n));
  };

  // The morph lane active at the last table() frame, if any.
  let cur: { addrs: number[]; mode: number; va: number; vb: number; m: number } | null = null;
  type Cur = NonNullable<typeof cur>;
  const mem = () => new Float32Array(w.memory.buffer);

  // Evaluate `render` with the lane's param at each key value, restore, then fuse the two results.
  const run = <T>(render: () => T, fuse: (a: T, b: T, c: Cur) => T): T => {
    const c = cur;
    if (!c) return render();
    const keep = c.addrs.map((a) => mem()[a >> 2]);
    const at = (v: number) => {
      c.addrs.forEach((a) => (mem()[a >> 2] = v));
      w.scope_begin();
      return render();
    };
    const [a, b] = [at(c.va), at(c.vb)];
    c.addrs.forEach((x, i) => (mem()[x >> 2] = keep[i]));
    w.scope_begin();
    return fuse(a, b, c);
  };

  const TABLE = 2048; // graph node buffer size (graph/node.rs N)
  const mixTables = (a: Float32Array, b: Float32Array, c = cur!): Float32Array => {
    if (a.length !== b.length) return a;
    if (a.length !== TABLE) return a.map((x, i) => x + (b[i] - x) * c.m);
    const buf = new Float32Array(w.memory.buffer, w.mix_ptr(), 3 * TABLE);
    buf.set(a, 0);
    buf.set(b, TABLE);
    w.mix(c.mode, c.m);
    return buf.slice(2 * TABLE);
  };

  return {
    lanes(): LaneView[] {
      const n = w.lane_dump();
      const d = f32(w.lane_dump_ptr(), n);
      let i = 1;
      return Array.from({ length: d[0] }, (_, l) => {
        const [kind, count] = [d[i++], d[i++]];
        const v: LaneView = {
          name: name(l),
          keys: [],
          addrs: [],
          curve: new Float32Array(0),
        };
        if (kind > 1) v.mode = kind - 1;
        if (kind === 1) v.lfo = [...d.subarray(i, (i += count))];
        else
          for (let k = 0; k < count; k++) v.keys.push({ t: d[i++], v: d[i++], c: d[i++] });
        const t = w.lane_targets(l);
        v.addrs = [
          ...new Uint32Array(w.memory.buffer, w.lane_targets_ptr(), t),
        ];
        const n = w.lane_curve(l);
        if (n) v.curve = f32(w.lane_curve_ptr(), n);
        return v;
      });
    },

    addLane(lfo: boolean, mode = 0) {
      const l = w.lane_add(lfo);
      if (l >= 0 && mode) w.lane_mode(l, mode);
      return l;
    },
    removeLane: (l: number) => w.lane_remove(l),

    link: (l: number, nodeAddr: number, param: number, on: boolean) =>
      w.lane_link(l, nodeAddr, param, on),
    addKey: (l: number, t: number, v: number) => w.key_add(l, t, v),
    setKey: (l: number, k: number, t: number, v: number) =>
      w.key_set(l, k, t, v),
    setCurve: (l: number, k: number, c: number) => w.key_curve(l, k, c),
    removeKey: (l: number, k: number) => w.key_remove(l, k),
    setLfo: (l: number, j: number, v: number) => w.lfo_set(l, j, v),

    rename(l: number, text: string) {
      let b = enc.encode(text);
      while (b.length > NAME_MAX) b = enc.encode((text = text.slice(0, -1)));
      new Uint8Array(w.memory.buffer, w.lane_name_ptr(), b.length).set(b);
      w.lane_rename(l, b.length);
    },

    // Output table for `frame` (call after apply). `render` rebuilds the table from the current
    // params. Under a crossfade/spectral lane the table is rendered with that lane's param at the
    // two bracketing key values and the results are blended, instead of interpolating the param.
    table(frame: number, render: () => Float32Array): Float32Array {
      const lane = w.kf_morph(frame) - 1;
      if (lane < 0) return ((cur = null), render());
      const [mode, va, vb, m] = f32(w.morph_ptr(), 4);
      const n = w.lane_targets(lane);
      const addrs = [...new Uint32Array(w.memory.buffer, w.lane_targets_ptr(), n)];
      cur = { addrs, mode, va, vb, m };
      return run(() => render().slice(), mixTables);
    },

    // Node scopes for the frame last passed to table(): blended the same way as the table.
    scopes<S extends { pts: Float32Array }>(render: () => S[]): S[] {
      return run(render, (a, b, c) =>
        a.length === b.length
          ? a.map((s, i) => ({ ...s, pts: mixTables(s.pts, b[i].pts, c) }))
          : a,
      );
    },

    apply(frame: number): Set<number> {
      const n = w.kf_apply(frame);
      return new Set(new Uint32Array(w.memory.buffer, w.kf_driven_ptr(), n));
    },
  };
}

export type Kf = ReturnType<typeof createKf>;
