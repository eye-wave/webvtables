import wasmUrl from "~wasm/webvtabes.wasm?url";

export type WasmExports = {
  on_mouse_move: (x: number, y: number) => void;
  on_mouse_down: (x: number, y: number) => void;
  on_mouse_up: (x: number, y: number) => void;
  get_cursor_kind: (x: number, y: number) => number;
  init: () => void;
  render: () => void;

  node_count: () => number;
  node_kind: (i: number) => number;
  node_param_count: (i: number) => number;
  node_param_value: (i: number, p: number) => number;
  max_links: () => number;
  link_at: (slot: number) => number;
  graph_version: () => number;

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
