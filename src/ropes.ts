import type { WasmExports } from "./wasm";

export type Pt = [x: number, y: number];

export function createRopes(w: WasmExports) {
  let hot = -1;

  return {
    pin: (id: number, [ax, ay]: Pt, [bx, by]: Pt) =>
      w.rope_pin(id, ax, ay, bx, by),
    drop: (id: number) => w.rope_drop(id),
    rename: (from: number, to: number) => w.rope_rename(from, to),
    step: (dt: number) => w.rope_step(dt) !== 0,
    hit: ([x, y]: Pt, r: number) => w.rope_hit(x, y, r),

    highlight(id: number): boolean {
      const changed = id !== hot;
      hot = id;
      return changed;
    },

    segments: () =>
      new Float32Array(
        w.memory.buffer,
        w.rope_out(),
        w.rope_segments(hot),
      ).slice(),
  };
}

export type Ropes = ReturnType<typeof createRopes>;
