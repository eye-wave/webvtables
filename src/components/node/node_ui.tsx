import { type Component } from "solid-js";
import type { nodes } from "../../generated/nodes";
import { DataView } from "./data_ui";
import { Flags, Head, Knob, Scope } from "./node";
import knobCss from "./knob.module.css";
import nodeUiCss from "./node_ui.module.css";

export type NodeUi = {
  view: Component;

  size?: [w: number, h: number];
};

export const ui: Partial<Record<(typeof nodes)[number]["name"], NodeUi>> = {
  Data: { size: [320, 360], view: DataView },

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
