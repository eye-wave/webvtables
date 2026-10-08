// interp: 0 none, 1 crossfade, 2 spectral
export function encodeWav(tables: Float32Array[], interp = 0, rate = 44100) {
  const len = tables.reduce((n, t) => n + t.length, 0);
  const sig = "Made with [https://github.com/username/webvtables] ";

  const xferHeaderBlock = [
    99,
    108,
    109,
    32,
    42,
    0,
    0,
    0,
    ...[...`<!>2048 ${interp}0000000 `].map((c) => c.charCodeAt(0)),
  ];

  const headerSize =
    12 + 24 + 12 + 8 + (xferHeaderBlock.length - 8) + sig.length + 8;
  const dataStart =
    headerSize + (headerSize % 4 !== 0 ? 4 - (headerSize % 4) : 0);

  const buf = new ArrayBuffer(dataStart + len * 4);
  const v = new DataView(buf);

  let o = 0;

  const str = (s: string) =>
    [...s].forEach((c) => v.setUint8(o++, c.charCodeAt(0)));
  const u32 = (n: number) => (v.setUint32(o, n, true), (o += 4));
  const u16 = (n: number) => (v.setUint16(o, n, true), (o += 2));
  (str("RIFF"), u32(buf.byteLength - 8), str("WAVE"));
  (str("fmt "),
    u32(16),
    u16(3),
    u16(1),
    u32(rate),
    u32(rate * 4),
    u16(4),
    u16(32));

  (str("clm "),
    u32(xferHeaderBlock.length - 8 + sig.length),
    xferHeaderBlock.slice(8).forEach((b) => v.setUint8(o++, b)),
    str(sig));

  (str("data"), u32(len * 4));
  o = dataStart;
  const out = new Float32Array(buf, o, len);
  let k = 0;
  for (const t of tables) out.set(t, (k += t.length) - t.length);
  return buf;
}
