import wasmUrl from "~wasm/webvtlabes.wasm?url";
import { math_ffi } from "./math";

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

  scope_begin(): void;
  scope_fill(node: number, widget: number): number;
  scope_ptr(): number;

  rope_pin(id: number, ax: number, ay: number, bx: number, by: number): void;
  rope_drop(id: number): void;
  rope_rename(from: number, to: number): void;
  rope_cfg(i: number, v: number): void;
  rope_step(dt: number): number;
  rope_hit(x: number, y: number, r: number): number;
  rope_segments(hot: number): number;
  rope_out(): number;

  node_kind(idx: number): number;
  kf_apply(frame: number): number;
  kf_driven_ptr(): number;
  lane_dump(): number;
  lane_dump_ptr(): number;
  lane_curve(lane: number): number;
  lane_curve_ptr(): number;
  lane_targets(lane: number): number;
  lane_targets_ptr(): number;
  lane_add(lfo: boolean): number;
  lane_mode(lane: number, mode: number): boolean;
  lane_remove(lane: number): void;
  lane_link(
    lane: number,
    nodeAddr: number,
    param: number,
    on: boolean,
  ): boolean;
  lane_rename(lane: number, len: number): boolean;
  lane_name(lane: number): number;
  lane_name_ptr(): number;
  key_add(lane: number, t: number, v: number): number;
  key_set(lane: number, idx: number, t: number, v: number): boolean;
  key_curve(lane: number, idx: number, c: number): boolean;
  key_remove(lane: number, idx: number): void;
  lfo_set(lane: number, j: number, v: number): boolean;
  project_new(): void;

  remove_node(idx: number): void;
  data_alloc(idx: number, frames: number): number;
  data_frames(idx: number): number;
  data_ptr(idx: number): number;
  add_link(s1: number, s2: number, t1: number, t2: number): number;

  node_sockets(idx: number): number;
  get_link(idx: number): number;
  remove_link(idx: number): void;
  node_has_widget(idx: number): boolean;
  nodes_len(): number;
  get_node(idx: number): number;
  get_param(idx: number, i: number): number;
  param_text(idx: number, i: number): number;
  param_text_ptr(): number;
  param_set_denorm(idx: number, i: number, v: number): boolean;
  param_denorm(idx: number, i: number, n: number): number;
  param_norm(idx: number, i: number, d: number): number;
  add_node(kind: number, x: number, y: number, w: number, h: number): number;
} & { memory: WebAssembly.Memory };

export async function loadWasm(): Promise<WasmExports> {
  let readStr: Reader<string>;
  let logBuffer = "";

  const wasmObject = await WebAssembly.instantiateStreaming(fetch(wasmUrl), {
    env: {
      ...math_ffi,
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
