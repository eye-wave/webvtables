const enum Op {
  FillStyle = 1,
  StrokeStyle = 2,
  LineWidth = 3,
  FillRect = 4,
  FillCircle = 5,
  StrokeLine = 6,
  FillText = 7,
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
  endFrame(): void;
}

const textDecoder = new TextDecoder();

/** Decodes one frame's opcode buffer and replays it against `r`. */
export function executeDrawBuffer(bytes: Uint8Array, r: Renderer) {
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
      default:
        console.error(`unknown draw opcode ${op} at byte ${p - 1}`);
        return;
    }
  }
  r.endFrame();
}
