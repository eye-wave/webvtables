import wasmUrl from "~wasm/webvtabes.wasm?url";

export type RawStr = {
  ptr: number;
  len: number;
};

type u8 = number;
type const_u8 = number;
type usize = number;
type isize = number;
type u32 = number;
type f32 = number;
type f64 = number;
type CursorKind = number;

export type WasmExports = {
  init: () => void;
  on_mouse_down: (x: f32, y: f32) => void;
  get_cursor_kind: (x: f32, y: f32) => CursorKind;
  iter_all_nodes: () => void;
  on_mouse_move: (x: f32, y: f32) => void;
  on_dblclick: (x: f32, y: f32) => void;
  on_mouse_up: (x: f32, y: f32) => void;
  node_count: () => usize;
  node_kind: (i: usize) => u8;
  node_param_count: (i: usize) => usize;
  node_param_value: (i: usize, p: usize) => f64;
  max_links: () => usize;
  link_at: (slot: usize) => u32;
  graph_version: () => u32;
  render: () => void;
  remove_node: (target_idx: usize) => void;
  add_node: (x: f32, y: f32, name_ptr: const_u8, name_len: usize) => isize;

  memory: WebAssembly.Memory;
};

export const NodeKind = { Oscillator: 0, Gain: 1, Output: 2 } as const;

export function unpackLink(
  packed: number,
): { from: number; to: number } | null {
  if ((packed & 0x8000_0000) === 0) return null;
  return { from: (packed >> 16) & 0x7fff, to: packed & 0xffff };
}

export function makeStrReader(exports: WasmExports) {
  return (ptr: number, len: number) =>
    new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len));
}

export async function loadWasm(
  env: WebAssembly.ModuleImports,
): Promise<WasmExports> {
  const resp = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiateStreaming(resp, { env });
  return instance.exports as unknown as WasmExports;
}
