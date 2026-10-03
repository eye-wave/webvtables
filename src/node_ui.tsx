import type { Component } from "solid-js";
import type { nodes } from "./generated/nodes";
import { Flags, Head, Knob, Scope } from "./node";

const Xfade = () => (
  <div class="xfade">
    <span>A</span>
    <div class="track">
      <i class="ball" />
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
        <div class="row">
          <Knob j={0} class="tall" />
          <Knob j={1} class="tall" />
        </div>
        <Flags />
      </>
    ),
  },

  Add: {
    size: [160, 202],
    view: () => (
      <>
        <Head />
        <Scope />
        <Xfade />
        <Knob j={0} class="tall" />
        <Flags />
      </>
    ),
  },

  Output: {
    size: [240, 140],
    view: () => (
      <>
        <Head />
        <div class="row" style={{ flex: 1, "min-height": 0 }}>
          <Scope w={0} style={{ flex: 2 }} />
          <Scope w={1} />
        </div>
        <Flags />
      </>
    ),
  },
};
