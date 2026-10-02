import wasmUrl from "~wasm/webvtlabes.wasm?url";

export type WasmExports = {
  links_len(): number;
  add_link(s1: number, s2: number, t1: number, t2: number): void;
  get_link(idx: number): number;
} & { memory: WebAssembly.Memory };

export async function loadWasm(): Promise<WasmExports> {
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(wasmUrl),
    {},
  );

  return instance.exports as unknown as WasmExports;
}
