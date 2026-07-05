import type { Renderer } from "./renderer";
import { camera } from "../camera";

export class Canvas2DRenderer implements Renderer {
  private _fontSize: number = 13;

  constructor(private ctx: CanvasRenderingContext2D) {}

  resize(width: number, height: number) {
    this.ctx.canvas.width = width;
    this.ctx.canvas.height = height;
  }

  beginFrame() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // World-space coordinates from here on; scale/translate is the camera.
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);
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

  fontSize(n: number) {
    this._fontSize = n;
  }

  fillText(text: string, x: number, y: number) {
    this.ctx.font = `${this._fontSize}px sans`;
    this.ctx.fillText(text, x, y);
  }

  endFrame() {}
}
