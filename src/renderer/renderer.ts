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
  fillText(text: string, size: number, x: number, y: number): void;
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
        const dir = view.getUint8(p + 22);
        p += 23;

        for (let i = 0; i < count; i++) {
          const dx = dir === 0 ? i * gap : 0;
          const dy = dir === 1 ? i * gap : 0;
          r.strokeLine(x1 + dx, y1 + dy, x2 + dx, y2 + dy);
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
