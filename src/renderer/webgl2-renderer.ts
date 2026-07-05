import type { Renderer } from "./renderer";
import { camera } from "../camera";
import VERTEX_SRC from "./shader-vert.glsl";
import FRAGMENT_SRC from "./shader-frag.glsl";

const FLOATS_PER_INSTANCE = 10;
const INITIAL_CAPACITY = 1024;

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
  private _fontSize: number = 13;

  constructor(
    private gl: WebGL2RenderingContext,
    private textCtx: CanvasRenderingContext2D,
  ) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
    }
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

    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.gl.canvas.width = width;
    this.gl.canvas.height = height;
    this.textCtx.canvas.width = width;
    this.textCtx.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  beginFrame() {
    this.count = 0;
    this.nextZ = 0;
    const { textCtx } = this;
    textCtx.setTransform(1, 0, 0, 1, 0, 0);
    textCtx.clearRect(0, 0, this.width, this.height);
    textCtx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);
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
    const { zoom } = camera;
    const cx = (x + w / 2) * zoom + camera.x;
    const cy = (y + h / 2) * zoom + camera.y;
    this.pushInstance(cx, cy, w * zoom, h * zoom, 0, this.fill, 0);
  }

  fillCircle(x: number, y: number, r: number) {
    const { zoom } = camera;
    const cx = x * zoom + camera.x;
    const cy = y * zoom + camera.y;
    const d = r * 2 * zoom;
    this.pushInstance(cx, cy, d, d, 0, this.fill, 1);
  }

  strokeLine(x1: number, y1: number, x2: number, y2: number) {
    const { zoom } = camera;
    const sx1 = x1 * zoom + camera.x;
    const sy1 = y1 * zoom + camera.y;
    const sx2 = x2 * zoom + camera.x;
    const sy2 = y2 * zoom + camera.y;
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const len = Math.hypot(dx, dy);
    const rot = Math.atan2(dy, dx);

    // prettier-ignore
    this.pushInstance((sx1 + sx2) / 2,(sy1 + sy2) / 2,len,this.lineW * zoom,rot,this.stroke,0);
  }

  fontSize(n: number) {
    this._fontSize = n;
  }

  fillText(text: string, x: number, y: number) {
    const [r, g, b] = this.fill;
    this.textCtx.font = `${this._fontSize}px sans`;
    this.textCtx.fillStyle = `rgb(${r * 255},${g * 255},${b * 255})`;
    this.textCtx.fillText(text, x, y);
  }

  endFrame() {
    const { gl } = this;
    if (this.count === 0) return;
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
    gl.bindVertexArray(null);
  }
}
