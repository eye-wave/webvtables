import type { Heightmap } from "../gfx/heightmap";
import type { WasmExports } from "../wasm";
import type { Kf } from "./kf";
import type { Scene } from "./scene";

const FRAMES = 256;

// Incrementally renders frame outputs into the heightmap; call once/frame before kf.apply().
// Change signal: saved bytes with frame-0 keyframes applied; also fires on drags.
// WASM revision counter would be exact.
export function createPreview(
  wasm: WasmExports,
  scene: Scene,
  kf: Kf,
  map: Heightmap,
) {
  let prev: Uint8Array | null = null;
  let next = 0;
  let todo = 0;

  const dirty = () => {
    kf.apply(0);
    const n = wasm.project_save();
    const now = new Uint8Array(wasm.memory.buffer, wasm.project_ptr(), n);
    if (prev && prev.length === n && !now.some((b, i) => b !== prev![i]))
      return false;
    prev = now.slice();
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
