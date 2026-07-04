import { loadWasm, makeStrReader, type WasmExports } from "./wasm";
import { executeDrawBuffer, type Renderer } from "./renderer/renderer";
import { Canvas2DRenderer } from "./renderer/canvas2d-renderer";
import { WebGL2Renderer } from "./renderer/webgl2-renderer";

declare const viewport: HTMLDivElement;
declare const canvas_graph: HTMLCanvasElement;

const CURSORS = ["default", "grab", "grabbing", "pointer"];

function createTextOverlay(base: HTMLCanvasElement): CanvasRenderingContext2D {
  const overlay = document.createElement("canvas");
  overlay.style.position = "absolute";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.pointerEvents = "none";
  base.insertAdjacentElement("afterend", overlay);
  const ctx = overlay.getContext("2d");
  if (!ctx) throw "Failed to get 2d context for text overlay";
  return ctx;
}

function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2");
  if (gl) return new WebGL2Renderer(gl, createTextOverlay(canvas));

  console.warn("WebGL2 unavailable, falling back to Canvas2D");
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw "Failed to get a rendering context";
  return new Canvas2DRenderer(ctx2d);
}

async function init() {
  const renderer = createRenderer(canvas_graph);

  let logBuffer = "";
  let readStr: (ptr: number, len: number) => string;

  const exports: WasmExports = await loadWasm({
    log_str(ptr: number, len: number) {
      logBuffer += readStr(ptr, len);
    },
    log_i32(n: number) {
      logBuffer += `${n}`;
    },
    log_f64(n: number) {
      logBuffer += `${n}`;
    },
    log_flush() {
      console.log(logBuffer);
      logBuffer = "";
    },

    round: (x: number) => Math.round(x),

    draw_flush(ptr: number, len: number) {
      executeDrawBuffer(
        new Uint8Array(exports.memory.buffer, ptr, len),
        renderer,
      );
    },
  });
  readStr = makeStrReader(exports);

  const posFromEvent = (e: MouseEvent): [number, number] => [
    e.clientX - canvas_graph.offsetLeft,
    e.clientY - canvas_graph.offsetTop,
  ];

  const mouseWrapper =
    (cb: (x: number, y: number) => void) => (e: MouseEvent) =>
      cb(...posFromEvent(e));

  window.onmouseup = mouseWrapper(exports.on_mouse_up);
  canvas_graph.onmousedown = mouseWrapper(exports.on_mouse_down);
  canvas_graph.onmousemove = (e) => {
    const pos = posFromEvent(e);
    exports.on_mouse_move(...pos);
    canvas_graph.style.cursor = CURSORS[exports.get_cursor_kind(...pos)];
  };

  exports.init();

  function onCanvasResize() {
    renderer.resize(viewport.offsetWidth, viewport.offsetHeight);
    exports.render();
  }

  window.addEventListener("resize", onCanvasResize);
  onCanvasResize();
}

init();
