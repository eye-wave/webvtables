import {
  loadWasm,
  makeStrReader,
  MouseDownResult,
  u8,
  type const_u8,
  type f32,
  type f64,
  type i32,
  type RawStr,
  type usize,
  type WasmExports,
} from "./wasm";
import { executeDrawBuffer, type Renderer } from "./renderer/renderer";
import { Canvas2DRenderer } from "./renderer/canvas2d-renderer";
import { WebGL2Renderer } from "./renderer/webgl2-renderer";
import { createKnobs } from "./audio/knobs";
import { registerContextMenu } from "./context-menu";
import { toWorld, zoomAt, pan, panByDrag } from "./camera";

createKnobs();

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

  const nodeNames: Record<string, RawStr[]> = {};
  let openMenu: (x: f32, y: f32, id: i32) => void;

  const wasm_ffi = {
    log_str(ptr: const_u8, len: usize) {
      logBuffer += readStr(ptr, len);
    },
    log_i32(n: i32) {
      logBuffer += `${n}`;
    },
    log_f64(n: f64) {
      logBuffer += `${n}`;
    },
    log_flush() {
      console.log(logBuffer);
      logBuffer = "";
    },

    push_node_name: (
      ptr: const_u8,
      len: usize,
      ptr2: const_u8,
      len2: usize,
    ) => {
      const category = readStr(ptr2, len2);

      if (!nodeNames[category]) nodeNames[category] = [];
      nodeNames[category].push({ ptr, len });
    },
    open_context_menu: (_x: f32, _y: f32, id: i32) =>
      openMenu(...lastMenuScreenPos, id),
    draw_flush(ptr: const_u8, len: usize) {
      executeDrawBuffer(
        new Uint8Array(exports.memory.buffer, ptr, len),
        renderer,
      );
    },
  };

  const math_ffi: Record<string, Math[keyof Math]> = {
    pow: Math.pow,
    exp: Math.exp,
    ln: Math.log,
    floor: Math.floor,
    round: Math.round,
    sin: Math.sin,
    cos: Math.cos,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    log10: Math.log10,
    max: Math.max,
  };

  for (const [name, fn] of Object.entries(math_ffi)) {
    math_ffi[name + "f"] = fn;
  }

  const exports: WasmExports = await loadWasm({ ...wasm_ffi, ...math_ffi });

  readStr = makeStrReader(exports);

  exports.iter_all_nodes();
  openMenu = registerContextMenu(exports, nodeNames);

  // Screen -> world through the camera. Rendering (both renderer impls)
  // applies the same camera to draw commands, so this stays in sync.
  const posFromEvent = (e: MouseEvent): [f32, f32] =>
    toWorld(
      e.clientX - viewport.offsetLeft,
      e.clientY - viewport.offsetTop,
    ) as [f32, f32];

  const mouseWrapper =
    (cb: (x: f32, y: f32, btn: u8, altKey: boolean) => void) =>
    (e: MouseEvent) =>
      cb(...posFromEvent(e), e.button as u8, e.altKey);

  // Context menus are placed by wasm at the world (x, y) it was told about,
  // which is camera-dependent. Remember where the triggering click actually
  // landed on screen and use that for menu placement instead.
  let lastMenuScreenPos: [f32, f32] = [0 as f32, 0 as f32];
  const rememberMenuPos = (e: MouseEvent) => {
    lastMenuScreenPos = [
      (e.clientX - viewport.offsetLeft) as f32,
      (e.clientY - viewport.offsetTop) as f32,
    ];
  };

  // Empty-canvas mousedown pans the viewport instead of doing nothing;
  // on_mouse_down's return tells us whether it actually grabbed a node,
  // param, socket, or link, so we don't fight over the same drag.
  let isPanning = false;
  let lastScreen: [number, number] = [0, 0];

  window.onmouseup = (e) => {
    isPanning = false;
    mouseWrapper(exports.on_mouse_up)(e);
  };
  canvas_graph.onmousedown = (e) => {
    const pos = posFromEvent(e);
    const hit = exports.on_mouse_down(...pos, e.button as u8, e.altKey);
    if (hit === MouseDownResult.Empty && e.button === 0) {
      isPanning = true;
      lastScreen = [e.clientX, e.clientY];
    }
  };
  canvas_graph.oncontextmenu = (e) => {
    e.preventDefault();
    rememberMenuPos(e);
    exports.on_dblclick(...posFromEvent(e), e.button as u8, e.altKey);
  };
  canvas_graph.ondblclick = (e) => {
    rememberMenuPos(e);
    mouseWrapper(exports.on_dblclick)(e);
  };

  canvas_graph.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const screenX = e.clientX - viewport.offsetLeft;
      const screenY = e.clientY - viewport.offsetTop;
      if (e.ctrlKey) {
        // pinch-to-zoom (trackpad) or ctrl+wheel: zoom around the cursor.
        zoomAt(screenX, screenY, e.deltaY);
      } else {
        // plain scroll/two-finger swipe: pan.
        pan(e.deltaX, e.deltaY);
      }
      exports.render(); // re-emit the draw buffer under the new camera
    },
    { passive: false },
  );

  canvas_graph.onmousemove = (e) => {
    if (isPanning) {
      panByDrag(e.clientX - lastScreen[0], e.clientY - lastScreen[1]);
      lastScreen = [e.clientX, e.clientY];
      exports.render(); // re-emit the draw buffer under the new camera
      return;
    }

    const pos = posFromEvent(e);
    exports.on_mouse_move(...pos, e.button as u8, e.altKey);
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
