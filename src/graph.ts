// @ts-nocheck
// litegraph.js's shipped .d.ts is thin/stale for subclassing
// LGraphNode with widgets, so this file trades strict typing for not
// fighting the library. Runtime behavior follows litegraph's own examples.
import { LGraphNode, LiteGraph } from "litegraph.js";

export class PhasorNode extends LGraphNode {
  static title = "Phasor";
  constructor() {
    super();
    this.addOutput("phase", "number");
    this.addProperty("freq", 440);
    this.addWidget("number", "freq", 440, (v) => (this.properties.freq = v));
  }
}

export class ShapeNode extends LGraphNode {
  static title = "Shape";
  constructor() {
    super();
    this.addInput("phase", "number");
    this.addOutput("wave", "number");
    this.addProperty("shape", "sine");
    this.addWidget("combo", "shape", "sine", (v) => (this.properties.shape = v), {
      values: ["sine", "square", "saw", "triangle"],
    });
  }
}

export class GainNode extends LGraphNode {
  static title = "Gain";
  constructor() {
    super();
    this.addInput("in", "number");
    this.addOutput("out", "number");
    this.addProperty("gain", 1.0);
    this.addWidget("number", "gain", 1.0, (v) => (this.properties.gain = v));
  }
}

export class OutputNode extends LGraphNode {
  static title = "Output";
  constructor() {
    super();
    this.addInput("in", "number");
  }
}

LiteGraph.registerNodeType("wavetable/phasor", PhasorNode);
LiteGraph.registerNodeType("wavetable/shape", ShapeNode);
LiteGraph.registerNodeType("wavetable/gain", GainNode);
LiteGraph.registerNodeType("wavetable/output", OutputNode);

// must match TYPE_* constants in rust/src/lib.rs
const TYPE_PHASOR = 0;
const TYPE_GAIN = 5;
const TYPE_OUTPUT = 6;
const SHAPE_BYTE = { sine: 1, square: 2, saw: 3, triangle: 4 };
const RECORD_LEN = 5; // 1 byte tag + 4 byte f32 le param

// Walks back from the Output node along single inputs and produces a flat
// source-first chain. Graph is a tree today (one input per node), so there's
// no branching to resolve - just follow node 0's input link every step.
export function serializeGraph(graph) {
  const output = graph._nodes.find((n) => n instanceof OutputNode);
  if (!output) return new Uint8Array(0);

  const chain = [];
  let node = output;
  while (node) {
    if (node instanceof PhasorNode) {
      chain.push({ type: TYPE_PHASOR, param: node.properties.freq });
    } else if (node instanceof ShapeNode) {
      chain.push({ type: SHAPE_BYTE[node.properties.shape] ?? 1, param: 0 });
    } else if (node instanceof GainNode) {
      chain.push({ type: TYPE_GAIN, param: node.properties.gain });
    } else if (node instanceof OutputNode) {
      chain.push({ type: TYPE_OUTPUT, param: 0 });
    }
    const link = node.getInputLink(0);
    node = link ? graph.getNodeById(link.origin_id) : null;
  }
  chain.reverse();

  const bytes = new Uint8Array(chain.length * RECORD_LEN);
  const view = new DataView(bytes.buffer);
  chain.forEach((n, i) => {
    view.setUint8(i * RECORD_LEN, n.type);
    view.setFloat32(i * RECORD_LEN + 1, n.param, true);
  });
  return bytes;
}
