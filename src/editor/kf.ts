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

    apply(frame: number): Set<number> {
      const n = w.kf_apply(frame);
      return new Set(new Uint32Array(w.memory.buffer, w.kf_driven_ptr(), n));
    },
  };
}

export type Kf = ReturnType<typeof createKf>;
