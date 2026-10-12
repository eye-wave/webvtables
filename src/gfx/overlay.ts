import decorationVs from "./shaders/decoration.vert.glsl";
import decorationFs from "./shaders/decoration.frag.glsl";
import linkVs from "./shaders/link.vert.glsl";
import linkFs from "./shaders/link.frag.glsl";
import ringVs from "./shaders/ring.vert.glsl";
import ringFs from "./shaders/ring.frag.glsl";
import waveVs from "./shaders/wave.vert.glsl";
import waveFs from "./shaders/wave.frag.glsl";
import imageVs from "./shaders/image.vert.glsl";
import imageFs from "./shaders/image.frag.glsl";
import type { View } from "./view";

export const GL_OPTS: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: true,
  stencil: false,
};

export const STRIDE = 6;
const PAD = 14;
export const RADIUS = 8;
const ROPE_R = 2;
const RING_R = 12;

export type Scope = {
  rect: [x: number, y: number, w: number, h: number];
  order: number;
  pts: Float32Array;
  color: [number, number, number];
};

// A Data node's image, drawn at full resolution here instead of in a DOM canvas.
// All rects are world units: clip = where it may draw, img = the picture, box = crop (x0 y0 x1 y1).
export type ImageDraw = {
  order: number;
  src: HTMLCanvasElement;
  clip: [x: number, y: number, w: number, h: number];
  img: [x: number, y: number, w: number, h: number];
  box: [x0: number, y0: number, x1: number, y1: number];
};

export type Frame = {
  nodes: Float32Array;
  view: View;
  segs: Float32Array;
  rings: [number, number][];
  scopes: Scope[];
  images: ImageDraw[];
  t: number;
};
export type Draw = (f: Frame) => void;

export const createShaderCompiler =
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
  const gl = canvas.getContext("webgl2", GL_OPTS);
  if (!gl) return () => {};

  const compile = createShaderCompiler(gl);
  const decor = compile(decorationVs, decorationFs);
  const rope = compile(linkVs, linkFs);
  const ring = compile(ringVs, ringFs);
  const wave = compile(waveVs, waveFs);
  const image = compile(imageVs, imageFs);
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
  const segments = stream(5, [
    [0, 4, 0],
    [1, 1, 4],
  ]);
  const centres = stream(2, [[0, 2, 0]]);

  const samples = stream(1, [
    [0, 1, 0],
    [1, 1, 1],
  ]);

  gl.useProgram(decor);
  gl.uniform1f(loc(decor, "uR"), RADIUS);
  gl.useProgram(rope);
  gl.uniform1f(loc(rope, "uR"), ROPE_R);
  gl.useProgram(ring);
  gl.uniform1f(loc(ring, "uR"), RING_R);
  gl.useProgram(image);
  gl.uniform1i(loc(image, "uTex"), 1); // unit 0 belongs to the heightmap's texture
  gl.uniform3f(loc(image, "uCol"), 0xf0 / 255, 0x62 / 255, 0x9a / 255); // IMAGE in data_ui.tsx
  const textures = new WeakMap<HTMLCanvasElement, WebGLTexture>();
  const texture = (src: HTMLCanvasElement) => {
    let t = textures.get(src);
    if (!t) {
      t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      textures.set(src, t);
    }
    return t;
  };

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return ({ nodes: inst, view, segs, rings, scopes, images, t }) => {
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
    // state is shared with the heightmap, which draws after us and changes it
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const p of [decor, rope, ring, wave, image]) {
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
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segs.length / 5);

    gl.useProgram(wave);
    gl.blendEquation(gl.MAX);
    for (const { rect, order, pts, color } of scopes) {
      gl.uniform3f(loc(wave, "uCol"), ...color);
      gl.uniform4f(loc(wave, "uRect"), ...rect);
      gl.uniform1f(loc(wave, "uCount"), pts.length);
      gl.uniform1f(loc(wave, "uZ"), 1 - (2 * (order + 1.5)) / (n + 1));
      samples(pts);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pts.length - 1);
    }
    gl.blendEquation(gl.FUNC_ADD);

    if (images.length) {
      gl.useProgram(image);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE1);
      for (const { src, order, clip, img, box } of images) {
        gl.bindTexture(gl.TEXTURE_2D, texture(src));
        gl.uniform4f(loc(image, "uClip"), ...clip);
        gl.uniform4f(loc(image, "uImg"), ...img);
        gl.uniform4f(loc(image, "uBox"), ...box);
        gl.uniform1f(loc(image, "uZ"), 1 - (2 * (order + 1.5)) / (n + 1));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.activeTexture(gl.TEXTURE0); // the heightmap keeps its texture bound here
    }

    gl.useProgram(decor);
    nodes();
    gl.uniform1f(loc(decor, "uPad"), PAD);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

    gl.useProgram(ring);
    gl.uniform1f(loc(ring, "uSpin"), (t * 2) % (2 * Math.PI));
    centres(Float32Array.from(rings.flat()));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, rings.length);
  };
}
