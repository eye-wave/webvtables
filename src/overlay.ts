import decorationVs from "./shaders/decoration.vert.glsl";
import decorationFs from "./shaders/decoration.frag.glsl";
import linkVs from "./shaders/link.vert.glsl";
import linkFs from "./shaders/link.frag.glsl";
import type { View } from "./view";

export const STRIDE = 6;
const PAD = 14;
export const RADIUS = 8;
const ROPE_R = 2;

export type Draw = (inst: Float32Array, view: View, segs: Float32Array) => void;

const createShaderCompiler =
  (gl: WebGL2RenderingContext) =>
  (vs: string, fs: string): WebGLProgram => {
    const prog = gl.createProgram();
    const pre = "#version 300 es\n";
    for (const [type, src] of [
      [gl.VERTEX_SHADER, pre + vs],
      [gl.FRAGMENT_SHADER, pre + fs],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(sh)!);
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    return prog;
  };

export function createOverlay(canvas: HTMLCanvasElement): Draw {
  const gl = canvas.getContext("webgl2");
  if (!gl) return () => {};

  const compile = createShaderCompiler(gl);
  const decor = compile(decorationVs, decorationFs);
  const rope = compile(linkVs, linkFs);
  const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

  const stream = (
    stride: number,
    attrs: [loc: number, size: number, off: number][],
  ) => {
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [l, size, off] of attrs) {
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4);
      gl.vertexAttribDivisor(l, 1);
    }
    return (data?: Float32Array) => {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    };
  };
  const nodes = stream(STRIDE, [
    [0, 4, 0],
    [1, 2, 4],
  ]);
  const segments = stream(4, [[0, 4, 0]]);

  gl.useProgram(decor);
  gl.uniform1f(loc(decor, "uR"), RADIUS);
  gl.useProgram(rope);
  gl.uniform1f(loc(rope, "uR"), ROPE_R);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return (inst, view, segs) => {
    const n = inst.length / STRIDE;
    const dpr = devicePixelRatio;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const p of [decor, rope]) {
      gl.useProgram(p);
      gl.uniform2f(loc(p, "uRes"), w, h);
      gl.uniform3f(loc(p, "uView"), ...view);
    }

    gl.useProgram(decor);
    gl.uniform1f(loc(decor, "uN"), n);
    nodes(inst);
    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    gl.uniform1f(loc(decor, "uPad"), 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.useProgram(rope);
    segments(segs);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segs.length / 4);

    gl.useProgram(decor);
    nodes();
    gl.uniform1f(loc(decor, "uPad"), PAD);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  };
}
