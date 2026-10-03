import type { Component } from "solid-js";
import type { nodes } from "../../generated/nodes";
import { Flags, Head, Knob, Scope } from "./node";
import knobCss from "./knob.module.css";
import nodeUiCss from "./node_ui.module.css";

const Xfade = () => (
  <div class={nodeUiCss.xfade}>
    <span>A</span>
    <div class={nodeUiCss.track}>
      <i class={nodeUiCss.ball} />
    </div>
    <span>B</span>
  </div>
);

export type NodeUi = {
  view: Component;

  size?: [w: number, h: number];
};

export const ui: Partial<Record<(typeof nodes)[number]["name"], NodeUi>> = {
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
    size: [160, 240],
    view: () => (
      <>
        <Head />
        <Scope />
        <Xfade />
        <Knob j={0} class={knobCss.tall} />
        <Flags />
      </>
    ),
  },
};
