import { createShaderCompiler } from "./overlay";
import vs from "./shaders/heightmap.vert.glsl";
import fs from "./shaders/heightmap.frag.glsl";
import vs3 from "./shaders/heightmap3d.vert.glsl";
import fs3 from "./shaders/heightmap3d.frag.glsl";

export const FRAMES = 256;
const COLS = 256;

export type Heightmap = ReturnType<typeof createHeightmap>;

// All frames in one COLS x (FRAMES + 1) float texture; extra row = live wave.
// Shader only samples it. point-sample columns; peak-pick buckets to avoid aliasing.
export function createHeightmap(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2");
  if (!gl)
    return {
      row(_f: number, _t: Float32Array) {},
      toggle() {},
      draw(_h: number, _t: Float32Array) {},
    };

  const compile = createShaderCompiler(gl);
  const flat = compile(vs, fs);
  const mesh = compile(vs3, fs3);
  let prog = flat;
  const u = (n: string) => gl.getUniformLocation(prog, n);
  for (prog of [mesh, flat]) {
    gl.useProgram(prog);
    gl.uniform1i(u("uTex"), 0);
  }
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, COLS, FRAMES + 1);
  // Full-size upload first: partial uploads into never-written storage make the
  // browser lazily clear it (the "texSubImage ... not been initialized" warning).
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    COLS,
    FRAMES + 1,
    gl.RED,
    gl.FLOAT,
    new Float32Array(COLS * (FRAMES + 1)),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const buf = new Float32Array(COLS);
  const put = (y: number, t: Float32Array) => {
    for (let i = 0; i < COLS; i++)
      buf[i] = t[Math.round((i * (t.length - 1)) / (COLS - 1))];
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, COLS, 1, gl.RED, gl.FLOAT, buf);
  };

  let is3d = false;
  return {
    row: put,

    toggle: () => void (is3d = !is3d),

    draw(head: number, live: Float32Array) {
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
      put(FRAMES, live);
      gl.viewport(0, 0, canvas.width, canvas.height);
      prog = is3d ? mesh : flat;
      gl.useProgram(prog);
      gl.uniform2f(u("uRes"), w, h);
      gl.uniform1f(u("uHead"), head);
      if (!is3d)
        return void (gl.disable(gl.DEPTH_TEST),
        gl.drawArrays(gl.TRIANGLES, 0, 3));
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1i(u("uLive"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, (COLS - 1) * (FRAMES - 1) * 6);
      // Live wave last, ignoring depth so the terrain can't bury it.
      gl.disable(gl.DEPTH_TEST);
      gl.uniform1i(u("uLive"), 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, COLS * 2);
    },
  };
}
