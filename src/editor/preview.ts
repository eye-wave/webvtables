import type { Heightmap } from "../gfx/heightmap";
import type { WasmExports } from "../wasm";
import { mathRev } from "../components/node/math";
import type { LazyKf } from "./kf";
import type { Scene } from "./scene";

const FRAMES = 256;

// Incrementally renders frame outputs into the heightmap; call once/frame before kf.apply().
// Change signal: everything that affects the output (kinds, params, links, lanes) with frame-0
// keyframes applied, compared to the last render. WASM revision counter would be exact.
export function createPreview(
  wasm: WasmExports,
  scene: Scene,
  kf: LazyKf,
  map: Heightmap,
) {
  let prev: number[] = [];
  let next = 0;
  let todo = 0;

  const signature = () => {
    const s: number[] = [mathRev()]; // Math node formulas live in JS, not wasm memory
    const m = wasm.memory.buffer;
    const [f32, u8, u16] = [new Float32Array(m), new Uint8Array(m), new Uint16Array(m)];
    for (let i = 0; i < wasm.nodes_len(); i++) {
      s.push(wasm.node_kind(i));
      // Data nodes: every import/edit reallocates, so the pointer changes (-1 for other nodes)
      s.push(wasm.data_ptr(i), wasm.data_frames(i));
      for (let j = 0, a; (a = wasm.get_param(i, j)) >= 0; j++) s.push(f32[a >> 2]);
    }
    for (let i = 0; i < wasm.links_len(); i++) {
      const p = wasm.get_link(i);
      s.push(u16[p >> 1], u8[p + 2], u16[(p >> 1) + 2], u8[p + 6]);
    }
    const n = wasm.lane_dump();
    const dump = new Float32Array(m, wasm.lane_dump_ptr(), n);
    for (const v of dump) s.push(v);
    for (let l = 0; l < dump[0]; l++) {
      const t = wasm.lane_targets(l);
      for (const a of new Uint32Array(m, wasm.lane_targets_ptr(), t)) s.push(a);
    }
    return s;
  };

  const dirty = () => {
    kf.apply(0);
    const now = signature();
    if (now.length === prev.length && now.every((v, i) => v === prev[i]))
      return false;
    prev = now;
    return true;
  };

  return {
    step(budgetMs = 4): boolean {
      if (dirty()) todo = FRAMES;
      if (!todo) return false;
      const t0 = performance.now();
      do {
        kf.apply(next);
        wasm.scope_begin();
        map.row(next, scene.outputTable());
        next = (next + 1) % FRAMES;
      } while (--todo && performance.now() - t0 < budgetMs);
      return todo > 0;
    },
  };
}
