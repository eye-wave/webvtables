import type { Heightmap } from "../gfx/heightmap";
import type { WasmExports } from "../wasm";
import type { Kf } from "./kf";
import type { Scene } from "./scene";

const FRAMES = 256;

// Renders every frame's output table into the heightmap a few ms at a time.
// Call step() once per animation frame, before the frame's own kf.apply():
// it leaves the keyframe state at whatever it rendered last.
//
// Change signal: the saved project bytes with keyframes applied at frame 0
// (so playback alone doesn't dirty it). ponytail: also fires on node drags
// (positions are saved); a revision counter from wasm would be exact.
export function createPreview(
  wasm: WasmExports,
  scene: Scene,
  kf: Kf,
  map: Heightmap,
) {
  let prev: Uint8Array | null = null;
  let next = 0; // round-robin cursor: survives edits, so every row refreshes
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

  // True while rows are still left to render, so the caller keeps animating.
  return {
    step(budgetMs = 4): boolean {
      if (dirty()) todo = FRAMES;
      if (!todo) return false;
      const t0 = performance.now();
      do {
        kf.apply(next);
        wasm.scope_begin();
        map.row(next, kf.table(next, () => scene.outputTable()));
        next = (next + 1) % FRAMES;
      } while (--todo && performance.now() - t0 < budgetMs);
      return todo > 0;
    },
  };
}
