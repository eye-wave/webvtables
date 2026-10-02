import wasmUrl from "~wasm/webvtlabes.wasm?url";

declare const ptr: unique symbol;
declare const int: unique symbol;
declare const uint: unique symbol;
declare const float: unique symbol;

export type ptr = number & { readonly [ptr]: never };
export type int = number & { readonly [int]: never };
export type uint = number & { readonly [uint]: never };
export type float = number & { readonly [float]: never };

export type WasmExports = {
  links_len(): number;
  add_link(s1: number, s2: number, t1: number, t2: number): void;
  get_link(idx: number): number;
  nodes_len(): number;
  get_node(idx: number): number;
  get_param(idx: number, i: number): number;
  add_node(kind: number, x: number, y: number, w: number, h: number, nParams: number): number;
} & { memory: WebAssembly.Memory };

export async function loadWasm(): Promise<WasmExports> {
  let readStr: Reader<string>;
  let logBuffer = "";

  const wasmObject = await WebAssembly.instantiateStreaming(fetch(wasmUrl), {
    env: {
      log_str(ptr: ptr, len: uint) {
        logBuffer += readStr(ptr, len);
      },
      log_bool(n: boolean) {
        logBuffer += n ? "true" : "false";
      },
      log_i32(n: int) {
        logBuffer += `${n}`;
      },
      log_f64(n: float) {
        logBuffer += `${n}`;
      },
      log_flush() {
        console.log(logBuffer);
        logBuffer = "";
      },
    },
  });

  const exp = wasmObject.instance.exports as WasmExports;
  readStr = createReader(exp.memory);

  return exp;
}

function readStr(mem: WebAssembly.Memory, ptr: number, len: number): string {
  return new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len));
}

export const createReader =
  (mem: WebAssembly.Memory) => (ptr: number, len: number) =>
    readStr(mem, ptr, len);

type Reader<T> = (ptr: number, len: number) => T;
