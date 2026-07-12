import type { Renderer } from "./renderer";
import { BUFFER_LEN } from "./renderer";

export class Canvas2DRenderer implements Renderer {
  constructor(private ctx: CanvasRenderingContext2D) {}

  resize(width: number, height: number) {
    this.ctx.canvas.width = width;
    this.ctx.canvas.height = height;
  }

  beginFrame() {
    const { ctx } = this;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  setFillStyle(r: number, g: number, b: number) {
    this.ctx.fillStyle = `rgb(${r},${g},${b})`;
  }

  setStrokeStyle(r: number, g: number, b: number) {
    this.ctx.strokeStyle = `rgb(${r},${g},${b})`;
  }

  setLineWidth(w: number) {
    this.ctx.lineWidth = w;
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.ctx.fillRect(x, y, w, h);
  }

  fillCircle(x: number, y: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  strokeLine(x1: number, y1: number, x2: number, y2: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  strokeLineRepeated(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    count: number,
    gap: number,
    dir: 0 | 1,
  ) {
    for (let i = 0; i < count; i++) {
      const dx = dir === 0 ? i * gap : 0;
      const dy = dir === 1 ? i * gap : 0;
      this.strokeLine(x1 + dx, y1 + dy, x2 + dx, y2 + dy);
    }
  }

  strokeArc(
    x: number,
    y: number,
    radius: number,
    minAngle: number,
    maxAngle: number,
  ) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, radius, minAngle, maxAngle);
    ctx.stroke();
  }

  fillText(text: string, size: number, x: number, y: number) {
    this.ctx.font = `${size}px sans`;
    this.ctx.fillText(text, x, y);
  }

  fillPoints(points: Float32Array, count: number) {
    if (count < 3) return;
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 1; i < count; i++)
      ctx.lineTo(points[i * 2], points[i * 2 + 1]);
    ctx.closePath();
    ctx.fill();
  }

  strokePoints(points: Float32Array, count: number) {
    if (count < 2) return;
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 1; i < count; i++)
      ctx.lineTo(points[i * 2], points[i * 2 + 1]);
    ctx.stroke();
  }

  fillWave(x: number, y: number, w: number, h: number, samples: Float32Array) {
    const { ctx } = this;

    const SKIP = 8;
    const step = w / (BUFFER_LEN - 1);
    const mid = y + h * 0.5;
    const scale = h * 0.5;
    const minY = y;
    const maxY = y + h;

    for (let i = 0; i < BUFFER_LEN - 1; i += SKIP) {
      const nextIdx = Math.min(BUFFER_LEN - 1, i + SKIP);

      const s1 = samples[i];
      const s2 = samples[nextIdx];

      const clipped = s1 > 1 || s1 < -1 || s2 > 1 || s2 < -1;
      ctx.strokeStyle = clipped ? "rgb(255,60,60)" : "rgb(120,200,255)";

      const x1 = x + i * step;
      const x2 = x + nextIdx * step;
      const y1 = Math.max(minY, Math.min(maxY, mid - s1 * scale));
      const y2 = Math.max(minY, Math.min(maxY, mid - s2 * scale));

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (nextIdx === BUFFER_LEN - 1) {
        break;
      }
    }
  }

  endFrame() {}
}
