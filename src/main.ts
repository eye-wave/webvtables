import {
  HitType,
  loadWasm,
  makeBtnTextSetter,
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
import { registerContextMenu } from "./context-menu";
import { registerNodePicker } from "./node-picker";
import { player } from "./audio/engine";
import { math_ffi } from "./wasm/math";

declare const viewport: HTMLDivElement;
declare const canvas_graph: HTMLCanvasElement;

const CURSORS = ["default", "grab", "grabbing", "pointer"];

function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2");
  if (gl) return new WebGL2Renderer(gl);

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
  let setBtnText: (idx: usize, text: string) => void;

  let exports: WasmExports;

  const nodeNames: Record<string, RawStr[]> = {};

  let openMenu: (x: f32, y: f32, hit: HitType) => void;
  let openPicker: (x: f32, y: f32) => void;

  const wasm_ffi = {
    log_str(ptr: const_u8, len: usize) {
      logBuffer += readStr(ptr, len);
    },
    log_bool(n: bool) {
      logBuffer += n ? "true" : "false";
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

    click_btn: async (id: usize) => {
      if (id === 0) {
        if (player.status === "uninitialized") {
          await player.initialize();
          exports.render();
        }

        if (player.status === "paused") {
          player.resume();
          setBtnText(0 as usize, "Pause");
        } else {
          player.pause();
          setBtnText(0 as usize, "Play");
        }
      }
    },
    open_context_menu: (x: f32, y: f32, raw_hit: u32) => {
      const hit = unpackHitResult(raw_hit);
      openMenu(x, y, hit);
    },
    open_node_picker: (x: f32, y: f32) => {
      openPicker(x, y);
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
  setBtnText = makeBtnTextSetter(exports);

  exports.iter_all_nodes();

  openMenu = registerContextMenu(exports, nodeNames);
  openPicker = registerNodePicker(exports, nodeNames);

  const posFromEvent = (e: MouseEvent): [f32, f32] =>
    [e.clientX - viewport.offsetLeft, e.clientY - viewport.offsetTop] as [
      f32,
      f32,
    ];

  const prevDef =
    <F extends (e: E) => void, E extends Event>(cb: F) =>
    (e: E) => {
      e.preventDefault();
      cb(e);
    };

  const mouseWrap =
    (cb: (x: f32, y: f32, btn: i8) => void) => (e: MouseEvent) =>
      cb(...posFromEvent(e), e.button as i8);

  window.onmouseup = mouseWrap(exports.on_mouse_up);

  canvas_graph.onmousedown = mouseWrap(exports.on_mouse_down);
  canvas_graph.ondblclick = mouseWrap(exports.on_dbl_click);
  canvas_graph.oncontextmenu = prevDef(mouseWrap(exports.on_context_menu));
  canvas_graph.onmousemove = (e) => {
    const pos = posFromEvent(e);
    exports.on_mouse_move(...pos, e.altKey);
    canvas_graph.style.cursor = CURSORS[exports.get_cursor_kind(...pos)];
  };

  canvas_graph.addEventListener(
    "wheel",
    prevDef((e) => {
      const pos = posFromEvent(e);
      exports.on_wheel(...pos, e.deltaX, e.deltaY, e.ctrlKey);
    }),
    { passive: false },
  );

  exports.init();

  function onCanvasResize() {
    exports.on_resize(window.innerWidth, window.innerHeight);
    renderer.resize(viewport.offsetWidth, viewport.offsetHeight);
    exports.render();
  }

  window.addEventListener("resize", onCanvasResize);
  onCanvasResize();
}

init();
