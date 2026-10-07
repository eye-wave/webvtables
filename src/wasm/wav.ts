export const FRAME = 2048;
export const MAX_FRAMES = 256;

// Mono 32-bit float WAV: 2048-sample frames, max 256.
// Our exports store samples at EOF, so read the final `size` bytes.
// Foreign WAVs may need proper `data` chunk-end handling.
export function parseWav(buf: ArrayBuffer): Float32Array {
  const v = new DataView(buf);
  const tag = (p: number) => String.fromCharCode(...new Uint8Array(buf, p, 4));
  if (buf.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE")
    throw new Error("Not a WAV file.");

  let float = false,
    size = -1;
  for (let p = 12; p + 8 <= buf.byteLength;) {
    const id = tag(p),
      n = v.getUint32(p + 4, true);
    if (id === "fmt ")
      float =
        v.getUint16(p + 8, true) === 3 && // IEEE float
        v.getUint16(p + 10, true) === 1 && // mono
        v.getUint16(p + 22, true) === 32;
    else if (id === "data") {
      size = Math.min(n, buf.byteLength);
      break;
    }
    p += 8 + n + (n & 1);
  }
  if (!float)
    throw new Error("Need a mono 32-bit float WAV (a webvtables export).");
  if (size < 0) throw new Error("WAV has no data chunk.");

  const frames = Math.min(MAX_FRAMES, Math.floor(size / 4 / FRAME));
  if (!frames) throw new Error("Less than one 2048-sample frame.");
  const start = buf.byteLength - size;
  // slice() also gives the 4-byte alignment Float32Array needs
  return new Float32Array(buf.slice(start, start + frames * FRAME * 4));
}
