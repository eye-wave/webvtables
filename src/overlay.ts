import decorationVs from "./shaders/decoration.vert.glsl";
import decorationFs from "./shaders/decoration.frag.glsl";

export const STRIDE = 6;
const PAD = 14;
export const RADIUS = 8;

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

export function createOverlay(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2");
  if (!gl) return (_: Float32Array) => {};

  const compile = createShaderCompiler(gl);

  const prog = compile(decorationVs, decorationFs);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  for (const [loc, size, off] of [
    [0, 4, 0],
    [1, 2, 4],
  ]) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, off * 4);
    gl.vertexAttribDivisor(loc, 1);
  }

  const u = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform1f(u("uR"), RADIUS);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return (inst: Float32Array) => {
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
    gl.uniform2f(u("uRes"), w, h);
    gl.uniform1f(u("uN"), n);
    gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STREAM_DRAW);

    gl.colorMask(false, false, false, false);
    gl.depthMask(true);
    gl.uniform1f(u("uPad"), 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.uniform1f(u("uPad"), PAD);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  };
}
