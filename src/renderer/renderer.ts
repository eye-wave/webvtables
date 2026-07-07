const BUFFER_LEN = 2048;

const enum Op {
  FillStyle = 1,
  StrokeStyle = 2,
  LineWidth = 3,
  FillRect = 4,
  FillCircle = 5,
  StrokeLine = 6,
  FillText = 7,
  FillWave = 8,
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
  fillText(text: string, x: number, y: number): void;
  fontSize(x: number): void;
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
        const x = view.getFloat32(p, true);
        const y = view.getFloat32(p + 4, true);
        const len = view.getUint16(p + 8, true);
        p += 10;
        const text = textDecoder.decode(bytes.subarray(p, p + len));
        p += len;
        r.fillText(text, x, y);
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

        const step = w / (BUFFER_LEN - 1);
        const mid = y + h * 0.5;
        const scale = h * 0.5;

        const minY = y;
        const maxY = y + h;

        for (let i = 0; i < BUFFER_LEN - 1; i++) {
          const s1 = buf[i];
          const s2 = buf[i + 1];

          const clipped = s1 > 1 || s1 < -1 || s2 > 1 || s2 < -1;

          if (clipped) {
            r.setStrokeStyle(255, 60, 60);
          } else {
            r.setStrokeStyle(120, 200, 255);
          }

          const x1 = x + i * step;
          const x2 = x + (i + 1) * step;

          const y1 = Math.max(minY, Math.min(maxY, mid - s1 * scale));
          const y2 = Math.max(minY, Math.min(maxY, mid - s2 * scale));

          r.strokeLine(x1, y1, x2, y2);
        }

        break;
      }
      default:
        console.error(`unknown draw opcode ${op} at byte ${p - 1}`);
        return;
    }
  }
  r.endFrame();
}
