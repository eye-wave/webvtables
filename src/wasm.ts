import wasmUrl from "~wasm/webvtabes.wasm?url";

export type RawBuffer = {
  ptr: mut_u8;
  len: usize;
};

export type RawStr = {
  ptr: const_u8;
  len: usize;
};

export function unpackBuffer(packed: u64): RawBuffer {
  const ptr = Number(packed >> 32n) as mut_u8;
  const len = Number(packed & 0xffffffffn) as usize;

  return { ptr, len };
}

export function unpackFloats(value: u64): [f32, f32] {
  const aBits = Number((value >> 32n) & 0xffffffffn);
  const bBits = Number(value & 0xffffffffn);

  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  view.setUint32(0, aBits);
  const a = view.getFloat32(0) as f32;

  view.setUint32(0, bBits);
  const b = view.getFloat32(0) as f32;

  return [a, b];
}

export type WasmExports = {
  init: () => void;
  on_mouse_down: (x: f32, y: f32) => u32;
  get_cursor_kind: (x: f32, y: f32) => u8;
  iter_all_nodes: () => void;
  on_mouse_move: (x: f32, y: f32, _btn: u8, alt_key: bool) => void;
  on_dbl_click: (x: f32, y: f32) => u32;
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
  remove_all_nodes: () => void;
  add_node: (x: f32, y: f32, name_ptr: const_u8, name_len: usize) => isize;
  serialize_graph: () => u64;
  free_buffer: (ptr: mut_u8, len: usize) => void;
  allocate_patch_buffer: (len: usize) => mut_u8;
  patch_graph: (buf_ptr: mut_u8, buf_len: usize) => i32;
  node_average_pos: () => u64;
  get_generated_frame: () => u64;

  memory: WebAssembly.Memory;
};

export const NodeKind = { Oscillator: 0, Gain: 1, Output: 2 } as const;

export function unpackLink(
  packed: number,
): { from: number; to: number } | null {
  if ((packed & 0x8000_0000) === 0) return null;
  return { from: (packed >> 16) & 0x7fff, to: packed & 0xffff };
}

export type HitType = {
  kind: u8;
  id: u16;
  subId: i8;
};

export function unpackHitResult(packedHit: u32): HitType {
  const kind = (packedHit & 0xff) as u8;
  const id = ((packedHit >>> 8) & 0xffff) as u16;
  const subIdRaw = (packedHit >>> 24) & 0xff;

  const subId = (subIdRaw >= 128 ? subIdRaw - 256 : subIdRaw) as i8;

  return {
    kind,
    id,
    subId,
  };
}

export function makeStrReader(exports: WasmExports) {
  return (ptr: number, len: number) =>
    new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len));
}

export function makeBufReader(exports: WasmExports) {
  return (ptr: number, len: number) =>
    new Uint8Array(exports.memory.buffer, ptr, len);
}

export function makeBuf32Reader(exports: WasmExports) {
  return (ptr: number, len: number) =>
    new Float32Array(
      exports.memory.buffer,
      ptr,
      len / Float32Array.BYTES_PER_ELEMENT,
    );
}

export async function loadWasm(
  env: WebAssembly.ModuleImports,
): Promise<WasmExports> {
  const resp = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiateStreaming(resp, { env });
  return instance.exports as unknown as WasmExports;
}
