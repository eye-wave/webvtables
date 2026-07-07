import {
  HitType,
  loadWasm,
  makeBuf32Reader,
  makeStrReader,
  unpackBuffer,
  unpackHitResult,
  type RawStr,
  type WasmExports,
} from "./wasm";
import { executeDrawBuffer, type Renderer } from "./renderer/renderer";
import { Canvas2DRenderer } from "./renderer/canvas2d-renderer";
import { WebGL2Renderer } from "./renderer/webgl2-renderer";
import { createKnobs } from "./audio/knobs";
import { registerContextMenu } from "./context-menu";
import { toWorld, zoomAt, pan, panByDrag } from "./camera";
import { registerNodePicker } from "./node-picker";
import { player } from "./audio/engine";
import { math_ffi } from "./wasm/math";

createKnobs();

declare const viewport: HTMLDivElement;
declare const canvas_graph: HTMLCanvasElement;
declare const play_btn: HTMLButtonElement;

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
  let readBuf32: (ptr: number, len: number) => Float32Array;

  let exports: WasmExports;

  const nodeNames: Record<string, RawStr[]> = {};

  let openMenu: (x: f32, y: f32, hit: HitType) => void;
  let openPicker: (x: f32, y: f32, id: i32) => void;

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
    draw_flush(ptr: const_u8, len: usize) {
      const fatptr = exports.get_generated_frame();
      const addr = unpackBuffer(fatptr);
      const buf = readBuf32(addr.ptr, addr.len);

      player.setWaveform(buf);

      executeDrawBuffer(
        new Uint8Array(exports.memory.buffer, ptr, len),
        renderer,
        exports.memory,
      );
    },
  };

  exports = await loadWasm({ ...wasm_ffi, ...math_ffi });

  readStr = makeStrReader(exports);
  readBuf32 = makeBuf32Reader(exports);

  exports.iter_all_nodes();

  openMenu = registerContextMenu(exports, nodeNames);
  openPicker = registerNodePicker(exports, nodeNames);

  // Screen -> world through the camera. Rendering (both renderer impls)
  // applies the same camera to draw commands, so this stays in sync.
  const worldPosFromEvent = (e: MouseEvent): [f32, f32] =>
    toWorld(
      e.clientX - viewport.offsetLeft,
      e.clientY - viewport.offsetTop,
    ) as [f32, f32];

  const posFromEvent = (e: MouseEvent): [f32, f32] =>
    [e.clientX - viewport.offsetLeft, e.clientY - viewport.offsetTop] as [
      f32,
      f32,
    ];

  const mouseWrapper =
    (cb: (x: f32, y: f32, btn: u8, altKey: boolean) => void) =>
    (e: MouseEvent) =>
      cb(...worldPosFromEvent(e), e.button as u8, e.altKey);

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
    const pos = worldPosFromEvent(e);
    const hit = unpackHitResult(exports.on_mouse_down(...pos));
    if (hit.kind === 0 && e.button === 0) {
      isPanning = true;
      lastScreen = [e.clientX, e.clientY];
    }
  };
  canvas_graph.ondblclick = (e) => {
    const pos = worldPosFromEvent(e);
    const hit = unpackHitResult(exports.on_dbl_click(...pos));

    if (hit.kind === 0 && e.button === 0) {
      openPicker(...posFromEvent(e), e.button as i32);
    }
  };
  canvas_graph.oncontextmenu = (e) => {
    e.preventDefault();

    const pos = worldPosFromEvent(e);
    const hit = unpackHitResult(exports.on_mouse_down(...pos));

    openMenu(...posFromEvent(e), hit);
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

    const pos = worldPosFromEvent(e);
    exports.on_mouse_move(...pos, e.button as u8, e.altKey);
    canvas_graph.style.cursor = CURSORS[exports.get_cursor_kind(...pos)];
  };

  exports.init();

  play_btn.onclick = async () => {
    if (player.status === "uninitialized") {
      await player.initialize();
      exports.render();
    }

    if (player.status === "paused") {
      player.resume();
      play_btn.textContent = "Pause";
    } else {
      player.pause();
      play_btn.textContent = "Play";
    }
  };

  function onCanvasResize() {
    renderer.resize(viewport.offsetWidth, viewport.offsetHeight);
    exports.render();
  }

  window.addEventListener("resize", onCanvasResize);
  onCanvasResize();
}

init();
