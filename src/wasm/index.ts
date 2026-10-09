import wasmUrl from "~wasm/webvtlabes.wasm?url";
import type { WasmFns } from "../generated/exports";
import { mathEval } from "../components/node/math";
import { math_ffi } from "./math";

export type WasmExports = WasmFns & {
  memory: WebAssembly.Memory;
};

export async function loadWasm(): Promise<WasmExports> {
  let readStr: Reader<string>;
  let logBuffer = "";

  const wasmObject = await WebAssembly.instantiateStreaming(fetch(wasmUrl), {
    env: {
      ...math_ffi,
      math_eval: mathEval,

      log_str(ptr: number, len: number) {
        logBuffer += readStr(ptr, len);
      },

      log_bool(n: number) {
        logBuffer += n ? "true" : "false";
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
    },
  });

  const exports = wasmObject.instance.exports as unknown as WasmExports;
  readStr = createReader(exports.memory);

  return exports;
}

function readStr(mem: WebAssembly.Memory, ptr: number, len: number): string {
  return new TextDecoder().decode(new Uint8Array(mem.buffer, ptr, len));
}

export const createReader =
  (mem: WebAssembly.Memory) =>
  (ptr: number, len: number): string =>
    readStr(mem, ptr, len);

type Reader<T> = (ptr: number, len: number) => T;
