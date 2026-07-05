import wasmUrl from "~wasm/webvtabes.wasm?url";

export type RawBuffer = {
  ptr: mut_u8;
  len: usize;
};

export type RawStr = {
  ptr: const_u8;
  len: usize;
};

export type u8 = number & { __brand: "u8" };
export type mut_u8 = number & { __brand: "mut_u8" };
export type const_u8 = number & { __brand: "const_u8" };
export type usize = number & { __brand: "usize" };
export type isize = number & { __brand: "isize" };
export type i32 = number & { __brand: "i32" };
export type u32 = number & { __brand: "u32" };
export type f32 = number & { __brand: "f32" };
export type f64 = number & { __brand: "f64" };
export type CursorKind = number & { __brand: "CursorKind" };
export type MouseDownResult = number & { __brand: "MouseDownResult" };
export const MouseDownResult = { Empty: 0, Interactive: 1 } as const;

export function unpackBuffer(packed: bigint): RawBuffer {
  const ptr = Number(packed >> 32n) as mut_u8;
  const len = Number(packed & 0xffffffffn) as usize;

  return { ptr, len };
}

export type WasmExports = {
  init: () => void;
  get_cursor_kind: (x: f32, y: f32) => CursorKind;
  iter_all_nodes: () => void;
  on_mouse_down: (x: f32, y: f32, btn: u8, altKey: boolean) => MouseDownResult;
  on_mouse_move: (x: f32, y: f32, btn: u8, altKey: boolean) => void;
  on_dblclick: (x: f32, y: f32, btn: u8, altKey: boolean) => void;
  on_mouse_up: (x: f32, y: f32, btn: u8, altKey: boolean) => void;
  node_count: () => usize;
  node_kind: (i: usize) => u8;
  node_param_count: (i: usize) => usize;
  node_param_value: (i: usize, p: usize) => f64;
  max_links: () => usize;
  link_at: (slot: usize) => u32;
  graph_version: () => u32;
  render: () => void;
  remove_node: (target_idx: usize) => void;
  remove_all_nodes: () => void;
  add_node: (x: f32, y: f32, name_ptr: const_u8, name_len: usize) => isize;
  serialize_graph: () => bigint;
  free_buffer: (ptr: mut_u8, len: usize) => void;
  patch_graph: (buf_ptr: mut_u8, buf_len: usize) => i32;
  allocate_patch_buffer: (len: usize) => mut_u8;

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

export function makeBufReader(exports: WasmExports) {
  return (ptr: number, len: number) =>
    new Uint8Array(exports.memory.buffer, ptr, len);
}

export async function loadWasm(
  env: WebAssembly.ModuleImports,
): Promise<WasmExports> {
  const resp = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiateStreaming(resp, { env });
  return instance.exports as unknown as WasmExports;
}
