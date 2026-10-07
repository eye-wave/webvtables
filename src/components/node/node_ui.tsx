import { type Component } from "solid-js";
import type { nodes } from "../../generated/nodes";
import { FRAME, parseWav } from "../../wasm/wav";
import { Flags, Head, Knob, Knobs, Scope, useNode } from "./node";
import knobCss from "./knob.module.css";
import nodeUiCss from "./node_ui.module.css";

export type NodeUi = {
  view: Component;

  size?: [w: number, h: number];
};

function DataView() {
  const ctx = useNode();
  let file!: HTMLInputElement;
  const load = async () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    try {
      const d = parseWav(await f.arrayBuffer());
      const p = ctx.wasm.data_alloc(+ctx.el!.dataset.n!, d.length / FRAME);
      if (p < 0) throw new Error("Could not allocate the frames.");
      // the view is made after the alloc: it may have grown (and detached) memory
      new Float32Array(ctx.wasm.memory.buffer, p, d.length).set(d);
      ctx.redraw();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <>
      <Head />
      <Knobs />
      <input ref={file} type="file" accept=".wav,audio/wav" hidden onChange={load} />
      <button
        class={nodeUiCss.import}
        on:pointerdown={(e) => e.stopPropagation()}
        onClick={() => file.click()}
      >
        Import .wav
      </button>
      <Flags />
      <Scope w={0} />
    </>
  );
}

export const ui: Partial<Record<(typeof nodes)[number]["name"], NodeUi>> = {
  Data: { size: [180, 164], view: DataView },

  "Basic shapes": {
    size: [200, 184],
    view: () => (
      <>
        <Head />
        <Scope />
        <div class={knobCss.row}>
          <Knob j={0} class={knobCss.tall} />
          <Knob j={1} class={knobCss.tall} />
        </div>
        <Flags />
      </>
    ),
  },

  Add: {
    size: [160, 220],
    view: () => (
      <>
        <Head />
        <Scope />
        <div class={nodeUiCss.xfade}>
          <span>A</span>
          <div class={nodeUiCss.track}>
            <i class={nodeUiCss.ball} />
          </div>
          <span>B</span>
        </div>
        <Knob j={0} class={knobCss.tall} />
        <Flags />
      </>
    ),
  },

  "XY Merge": {
    size: [260, 205],
    view: () => (
      <>
        <Head />
        <Scope />
        <div class={knobCss.row}>
          <div class={nodeUiCss.xmerge}>
            <span style={{ "grid-area": "1 / 1" }}>1</span>
            <span style={{ "grid-area": "1 / 3" }}>2</span>
            <span style={{ "grid-area": "3 / 1" }}>3</span>
            <span style={{ "grid-area": "3 / 3" }}>4</span>

            <div class={nodeUiCss.track} style={{ "grid-area": "2 / 2" }}>
              <i class={nodeUiCss.ball} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <Knob j={0} />
            <Knob j={1} />
          </div>
        </div>
        <Flags />
      </>
    ),
  },
};
