import type { Renderer } from "./renderer";
import { BUFFER_LEN } from "./renderer";
import VERTEX_SRC from "./shader-vert.glsl";
import FRAGMENT_SRC from "./shader-frag.glsl";
import TEXT_VERT_SRC from "./glyph-vert.glsl";
import TEXT_FRAG_SRC from "./glyph-frag.glsl";
import WAVE_VERT_SRC from "./wave-vert.glsl";
import WAVE_FRAG_SRC from "./wave-frag.glsl";

const FLOATS_PER_INSTANCE = 10;
const INITIAL_CAPACITY = 1024;
const GLYPH_CACHE_MAX = 2000;

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function link(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export function computeGlyphBox(
  metrics: Pick<
    TextMetrics,
    "width" | "actualBoundingBoxAscent" | "actualBoundingBoxDescent"
  >,
  size: number,
): { w: number; h: number; ascent: number } {
  const ascent = metrics.actualBoundingBoxAscent || size;
  const descent = metrics.actualBoundingBoxDescent || size * 0.25;
  return {
    w: Math.max(1, Math.ceil(metrics.width)),
    h: Math.max(1, Math.ceil(ascent + descent)),
    ascent,
  };
}

export function __selfCheckComputeGlyphBox() {
  const box = computeGlyphBox(
    { width: 42, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 },
    16,
  );
  console.assert(box.w === 42, "width should pass through ceiled");
  console.assert(box.h === 13, "height should be ascent+descent ceiled");
  console.assert(box.ascent === 10, "ascent should pass through");
  const fallback = computeGlyphBox({ width: 5.2 } as TextMetrics, 20);
  console.assert(
    fallback.h === Math.ceil(20 + 20 * 0.25),
    "fallback ascent/descent from size",
  );
}

interface GlyphEntry {
  tex: WebGLTexture;
  w: number;
  h: number;
  ascent: number;
}

interface TextInstance {
  tex: WebGLTexture;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

interface WaveInstance {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  lineWidth: number;
  samples: Float32Array;
}

function createOffscreenMeasureCtx(): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) throw "Failed to get 2d context for text measurement";
  return ctx;
}

export class WebGL2Renderer implements Renderer {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instanceBuf: WebGLBuffer;
  private uResolution: WebGLUniformLocation;
  private data = new Float32Array(INITIAL_CAPACITY * FLOATS_PER_INSTANCE);
  private count = 0;
  private nextZ = 0;
  private fill: [number, number, number] = [0, 0, 0];
  private stroke: [number, number, number] = [0, 0, 0];
  private lineW = 1;
  private width = 0;
  private height = 0;

  // Text-as-texture pipeline.
  private textProgram: WebGLProgram;
  private textVao: WebGLVertexArrayObject;
  private textUResolution: WebGLUniformLocation;
  private textUCenter: WebGLUniformLocation;
  private textUSize: WebGLUniformLocation;
  private textUZ: WebGLUniformLocation;
  private textUSampler: WebGLUniformLocation;
  private glyphCache = new Map<string, GlyphEntry>();
  private textInstances: TextInstance[] = [];
  private measureCtx: CanvasRenderingContext2D;

  // Waveform pipeline: one instanced draw call per waveform, geometry built
  // on the GPU from a sample texture (gl_InstanceID + texelFetch) instead of
  // pushing BUFFER_LEN-1 line instances from JS every frame.
  private waveProgram: WebGLProgram;
  private waveVao: WebGLVertexArrayObject;
  private waveTex: WebGLTexture;
  private waveUResolution: WebGLUniformLocation;
  private waveUOrigin: WebGLUniformLocation;
  private waveUSize: WebGLUniformLocation;
  private waveUZ: WebGLUniformLocation;
  private waveULineWidth: WebGLUniformLocation;
  private waveUSampler: WebGLUniformLocation;
  private waveUCount: WebGLUniformLocation;
  private waveInstances: WaveInstance[] = [];

  constructor(
    private gl: WebGL2RenderingContext,
    textCtx?: CanvasRenderingContext2D,
  ) {
    // textCtx param kept optional for call-site compat; only used for font measurement now
    // (no longer a drawn-to overlay), so we make our own if the caller didn't pass one.
    this.measureCtx = textCtx ?? createOffscreenMeasureCtx();

    const program = link(gl, VERTEX_SRC, FRAGMENT_SRC);
    this.program = program;
    this.uResolution = gl.getUniformLocation(program, "uResolution")!;

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    // Shared unit-quad base geometry (-0.5..0.5), one triangle strip.
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const instanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    const stride = FLOATS_PER_INSTANCE * 4;
    const attr = (location: number, size: number, offsetFloats: number) => {
      gl.enableVertexAttribArray(location);
      // prettier-ignore
      gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offsetFloats * 4);
      gl.vertexAttribDivisor(location, 1);
    };

    attr(1, 2, 0); // aCenter
    attr(2, 2, 2); // aSize
    attr(3, 1, 4); // aRot
    attr(4, 3, 5); // aColor
    attr(5, 1, 8); // aZ
    attr(6, 1, 9); // aShape

    this.instanceBuf = instanceBuf;
    this.vao = vao;

    // Text quad pipeline: reuses the same unit-quad geometry, non-instanced
    // (draw count is one draw call per unique on-screen text placement, not
    // per unique glyph texture - textures are cached/reused across frames).
    const textProgram = link(gl, TEXT_VERT_SRC, TEXT_FRAG_SRC);
    this.textProgram = textProgram;
    this.textUResolution = gl.getUniformLocation(textProgram, "uResolution")!;
    this.textUCenter = gl.getUniformLocation(textProgram, "uCenter")!;
    this.textUSize = gl.getUniformLocation(textProgram, "uSize")!;
    this.textUZ = gl.getUniformLocation(textProgram, "uZ")!;
    this.textUSampler = gl.getUniformLocation(textProgram, "uSampler")!;

    const textVao = gl.createVertexArray()!;
    gl.bindVertexArray(textVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.textVao = textVao;

    // Waveform pipeline: reuses the same unit-quad geometry, instanced by
    // gl_InstanceID with per-segment data pulled from a sample texture.
    const waveProgram = link(gl, WAVE_VERT_SRC, WAVE_FRAG_SRC);
    this.waveProgram = waveProgram;
    this.waveUResolution = gl.getUniformLocation(waveProgram, "uResolution")!;
    this.waveUOrigin = gl.getUniformLocation(waveProgram, "uOrigin")!;
    this.waveUSize = gl.getUniformLocation(waveProgram, "uSize")!;
    this.waveUZ = gl.getUniformLocation(waveProgram, "uZ")!;
    this.waveULineWidth = gl.getUniformLocation(waveProgram, "uLineWidth")!;
    this.waveUSampler = gl.getUniformLocation(waveProgram, "uSamples")!;
    this.waveUCount = gl.getUniformLocation(waveProgram, "uCount")!;

    const waveVao = gl.createVertexArray()!;
    gl.bindVertexArray(waveVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.waveVao = waveVao;

    const waveTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, waveTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      BUFFER_LEN,
      1,
      0,
      gl.RED,
      gl.FLOAT,
      null,
    );
    this.waveTex = waveTex;

    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.gl.canvas.width = width;
    this.gl.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  beginFrame() {
    this.count = 0;
    this.nextZ = 0;
    this.textInstances = [];
    this.waveInstances = [];
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  setFillStyle(r: number, g: number, b: number) {
    this.fill = [r / 255, g / 255, b / 255];
  }

  setStrokeStyle(r: number, g: number, b: number) {
    this.stroke = [r / 255, g / 255, b / 255];
  }

  setLineWidth(w: number) {
    this.lineW = w;
  }

  private growIfNeeded() {
    if (this.count * FLOATS_PER_INSTANCE < this.data.length) return;
    const grown = new Float32Array(this.data.length * 2);
    grown.set(this.data);
    this.data = grown;
  }

  private pushInstance(
    cx: number,
    cy: number,
    sx: number,
    sy: number,
    rot: number,
    color: [number, number, number],
    shape: 0 | 1,
  ) {
    this.growIfNeeded();

    const z = 1 - this.nextZ++ / 1_000_000;
    const o = this.count * FLOATS_PER_INSTANCE;
    this.data.set(
      [cx, cy, sx, sy, rot, color[0], color[1], color[2], z, shape],
      o,
    );
    this.count++;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.pushInstance(x + w / 2, y + h / 2, w, h, 0, this.fill, 0);
  }

  fillCircle(x: number, y: number, r: number) {
    this.pushInstance(x, y, r * 2, r * 2, 0, this.fill, 1);
  }

  strokeLine(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const rot = Math.atan2(dy, dx);

    // prettier-ignore
    this.pushInstance((x1 + x2) / 2,(y1 + y2) / 2,len,this.lineW,rot,this.stroke,0);
  }

  private getGlyphEntry(text: string, size: number): GlyphEntry {
    const [r, g, b] = this.fill;
    const key = `${size}|${r},${g},${b}|${text}`;

    const cached = this.glyphCache.get(key);
    if (cached) {
      this.glyphCache.delete(key);
      this.glyphCache.set(key, cached);
      return cached;
    }

    this.measureCtx.font = `${size}px sans`;
    const metrics = this.measureCtx.measureText(text);
    const { w, h, ascent } = computeGlyphBox(metrics, size);

    const glyphCanvas = document.createElement("canvas");
    glyphCanvas.width = w;
    glyphCanvas.height = h;
    const gctx = glyphCanvas.getContext("2d")!;
    gctx.font = `${size}px sans`;
    gctx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
    gctx.textBaseline = "alphabetic";
    gctx.fillText(text, 0, ascent);

    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      glyphCanvas,
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const entry: GlyphEntry = { tex, w, h, ascent };
    this.glyphCache.set(key, entry);

    if (this.glyphCache.size > GLYPH_CACHE_MAX) {
      const oldestKey = this.glyphCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.glyphCache.get(oldestKey)!;
        gl.deleteTexture(oldest.tex);
        this.glyphCache.delete(oldestKey);
      }
    }

    return entry;
  }

  fillText(text: string, size: number, x: number, y: number) {
    const { tex, w, h, ascent } = this.getGlyphEntry(text, size);
    const z = 1 - this.nextZ++ / 1_000_000;
    this.textInstances.push({
      tex,
      x: x + w / 2,
      y: y - ascent + h / 2,
      w,
      h,
      z,
    });
  }

  fillWave(x: number, y: number, w: number, h: number, samples: Float32Array) {
    const z = 1 - this.nextZ++ / 1_000_000;
    this.waveInstances.push({
      x,
      y,
      w,
      h,
      z,
      lineWidth: this.lineW,
      samples: samples.slice(),
    });
  }

  endFrame() {
    const { gl } = this;

    if (this.count > 0) {
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.data.subarray(0, this.count * FLOATS_PER_INSTANCE),
        gl.DYNAMIC_DRAW,
      );
      gl.uniform2f(this.uResolution, this.width, this.height);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    }

    if (this.waveInstances.length > 0) {
      gl.useProgram(this.waveProgram);
      gl.bindVertexArray(this.waveVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
      gl.uniform1i(this.waveUSampler, 0);
      gl.uniform2f(this.waveUResolution, this.width, this.height);
      gl.uniform1i(this.waveUCount, BUFFER_LEN);
      for (const wv of this.waveInstances) {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          BUFFER_LEN,
          1,
          gl.RED,
          gl.FLOAT,
          wv.samples,
        );
        gl.uniform2f(this.waveUOrigin, wv.x, wv.y);
        gl.uniform2f(this.waveUSize, wv.w, wv.h);
        gl.uniform1f(this.waveUZ, wv.z);
        gl.uniform1f(this.waveULineWidth, wv.lineWidth);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, BUFFER_LEN - 1);
      }
    }

    if (this.textInstances.length > 0) {
      gl.useProgram(this.textProgram);
      gl.bindVertexArray(this.textVao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(this.textUResolution, this.width, this.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.textUSampler, 0);
      for (const t of this.textInstances) {
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.uniform2f(this.textUCenter, t.x, t.y);
        gl.uniform2f(this.textUSize, t.w, t.h);
        gl.uniform1f(this.textUZ, t.z);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.BLEND);
    }

    gl.bindVertexArray(null);
  }
}
