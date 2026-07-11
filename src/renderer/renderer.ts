export const BUFFER_LEN = 2048;

const enum Op {
  FillStyle = 1,
  StrokeStyle = 2,
  LineWidth = 3,
  FillRect = 4,
  FillCircle = 5,
  StrokeLine = 6,
  FillText = 7,
  FillWave = 8,
  StrokeLineRepeated = 9,
  StrokeArc = 10,
  FillPoints = 11,
  StrokePoints = 12,
  FillPointsRef = 13,
  StrokePointsRef = 14,
}

export interface Renderer {
  resize(width: number, height: number): void;
  beginFrame(): void;
  setFillStyle(r: number, g: number, b: number): void;
  setStrokeStyle(r: number, g: number, b: number): void;
  setLineWidth(w: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillCircle(x: number, y: number, r: number): void;
  strokeLine(x1: number, y1: number, x2: number, y2: number): void;
  /** Same visual result as calling strokeLine `count` times, offset by `gap`
   * along x (dir 0) or y (dir 1) each repeat — implementations should draw
   * this as a single batched/instanced operation, not a JS-side loop. */
  strokeLineRepeated(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    count: number,
    gap: number,
    dir: 0 | 1,
  ): void;
  /** Strokes an arc of `radius` around x,y from minAngle to maxAngle
   * (radians, matching atan2(dy,dx) convention, clockwise since y is down). */
  strokeArc(
    x: number,
    y: number,
    radius: number,
    minAngle: number,
    maxAngle: number,
  ): void;
  fillText(text: string, size: number, x: number, y: number): void;
  /** Fills the polygon whose `count` vertices are the (x,y) pairs in `points`. */
  fillPoints(points: Float32Array, count: number): void;
  /** Strokes the open polyline through the `count` vertices in `points`. */
  strokePoints(points: Float32Array, count: number): void;
  /** Draws BUFFER_LEN samples in [-1,1] as a waveform inside x,y,w,h. */
  fillWave(
    x: number,
    y: number,
    w: number,
    h: number,
    samples: Float32Array,
  ): void;
  endFrame(): void;
}

const textDecoder = new TextDecoder();

/** Decodes one frame's opcode buffer and replays it against `r`. */
export function executeDrawBuffer(
  bytes: Uint8Array,
  r: Renderer,
  mem: WebAssembly.Memory,
) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;

  r.beginFrame();
  while (p < bytes.length) {
    const op = view.getUint8(p);
    p += 1;
    switch (op) {
      case Op.FillStyle:
        r.setFillStyle(
          view.getUint8(p),
          view.getUint8(p + 1),
          view.getUint8(p + 2),
        );
        p += 3;
        break;
      case Op.StrokeStyle:
        r.setStrokeStyle(
          view.getUint8(p),
          view.getUint8(p + 1),
          view.getUint8(p + 2),
        );
        p += 3;
        break;
      case Op.LineWidth:
        r.setLineWidth(view.getFloat32(p, true));
        p += 4;
        break;
      case Op.FillRect:
        r.fillRect(
          view.getFloat32(p, true),
          view.getFloat32(p + 4, true),
          view.getFloat32(p + 8, true),
          view.getFloat32(p + 12, true),
        );
        p += 16;
        break;
      case Op.FillCircle:
        r.fillCircle(
          view.getFloat32(p, true),
          view.getFloat32(p + 4, true),
          view.getFloat32(p + 8, true),
        );
        p += 12;
        break;
      case Op.StrokeLine:
        r.strokeLine(
          view.getFloat32(p, true),
          view.getFloat32(p + 4, true),
          view.getFloat32(p + 8, true),
          view.getFloat32(p + 12, true),
        );
        p += 16;
        break;
      case Op.FillText: {
        const size = view.getFloat32(p, true);
        const x = view.getFloat32(p + 4, true);
        const y = view.getFloat32(p + 8, true);
        const len = view.getUint16(p + 12, true);
        p += 14;
        const text = textDecoder.decode(bytes.subarray(p, p + len));
        p += len;
        r.fillText(text, size, x, y);
        break;
      }
      case Op.FillWave: {
        const x = view.getFloat32(p, true);
        const y = view.getFloat32(p + 4, true);
        const w = view.getFloat32(p + 8, true);
        const h = view.getFloat32(p + 12, true);
        const ptr = view.getUint32(p + 16, true);
        p += 20;

        const buf = new Float32Array(mem.buffer, ptr, BUFFER_LEN);
        r.fillWave(x, y, w, h, buf);
        break;
      }
      case Op.StrokeLineRepeated: {
        const x1 = view.getFloat32(p, true);
        const y1 = view.getFloat32(p + 4, true);
        const x2 = view.getFloat32(p + 8, true);
        const y2 = view.getFloat32(p + 12, true);
        const count = view.getUint16(p + 16, true);
        const gap = view.getFloat32(p + 18, true);
        const dir = view.getUint8(p + 22) as 0 | 1;
        p += 23;

        r.strokeLineRepeated(x1, y1, x2, y2, count, gap, dir);
        break;
      }
      case Op.FillPoints: {
        const count = view.getUint16(p, true);
        p += 2;
        const points = new Float32Array(count * 2);
        for (let i = 0; i < points.length; i++, p += 4) {
          points[i] = view.getFloat32(p, true);
        }
        r.fillPoints(points, count);
        break;
      }
      case Op.StrokePoints: {
        const count = view.getUint16(p, true);
        p += 2;
        const points = new Float32Array(count * 2);
        for (let i = 0; i < points.length; i++, p += 4) {
          points[i] = view.getFloat32(p, true);
        }
        r.strokePoints(points, count);
        break;
      }
      case Op.FillPointsRef: {
        const ptr = view.getUint32(p, true);
        const count = view.getUint16(p + 4, true);
        p += 6;
        r.fillPoints(new Float32Array(mem.buffer, ptr, count * 2), count);
        break;
      }
      case Op.StrokePointsRef: {
        const ptr = view.getUint32(p, true);
        const count = view.getUint16(p + 4, true);
        p += 6;
        r.strokePoints(new Float32Array(mem.buffer, ptr, count * 2), count);
        break;
      }
      case Op.StrokeArc: {
        const x = view.getFloat32(p, true);
        const y = view.getFloat32(p + 4, true);
        const radius = view.getFloat32(p + 8, true);
        const minAngle = view.getFloat32(p + 12, true);
        const maxAngle = view.getFloat32(p + 16, true);
        p += 20;

        r.strokeArc(x, y, radius, minAngle, maxAngle);
        break;
      }
      default:
        console.error(`unknown draw opcode ${op} at byte ${p - 1}`);
        return;
    }
  }
  r.endFrame();
}
