import { LGraph, LGraphCanvas, LiteGraph } from "litegraph.js";
import { serializeGraph } from "./graph";

const graph = new LGraph();
new LGraphCanvas("#graph", graph);

const phasor = LiteGraph.createNode("wavetable/phasor")!;
phasor.pos = [50, 80];
graph.add(phasor);

const shape = LiteGraph.createNode("wavetable/shape")!;
shape.pos = [300, 80];
graph.add(shape);

const gain = LiteGraph.createNode("wavetable/gain")!;
gain.pos = [550, 80];
graph.add(gain);

const output = LiteGraph.createNode("wavetable/output")!;
output.pos = [800, 80];
graph.add(output);

phasor.connect(0, shape, 0);
shape.connect(0, gain, 0);
gain.connect(0, output, 0);

graph.start();

let exports: WebAssembly.Exports;

async function loadWasm() {
  const resp = await fetch("/wavetable.wasm");
  const { instance } = await WebAssembly.instantiateStreaming(resp, {});
  exports = instance.exports;
}

function renderFrame(): Float32Array {
  const bytes = serializeGraph(graph);
  const memory = exports.memory as WebAssembly.Memory;
  const capacity = (exports.input_capacity as CallableFunction)() as number;
  if (bytes.length > capacity) {
    throw new Error(`graph chain (${bytes.length}B) exceeds wasm input capacity (${capacity}B)`);
  }

  const inputPtr = (exports.input_ptr as CallableFunction)() as number;
  new Uint8Array(memory.buffer, inputPtr, bytes.length).set(bytes);
  (exports.render as CallableFunction)(bytes.length);

  const outPtr = (exports.output_ptr as CallableFunction)() as number;
  const outLen = (exports.output_len as CallableFunction)() as number;
  // copy out (slice) so the view survives if wasm memory later grows/moves
  return new Float32Array(memory.buffer.slice(outPtr, outPtr + outLen * 4));
}

function drawFrame(samples: Float32Array) {
  const canvas = document.getElementById("wave") as HTMLCanvasElement;
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#4af";
  ctx.beginPath();
  samples.forEach((s, i) => {
    const x = (i / (samples.length - 1)) * canvas.width;
    const y = canvas.height / 2 - s * (canvas.height / 2 - 4);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

document.getElementById("render")!.addEventListener("click", () => {
  drawFrame(renderFrame());
});

loadWasm();
