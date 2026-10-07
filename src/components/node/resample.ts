export type Method = "nearest" | "linear" | "cubic" | "area";

// Resamples src[start, start+len) (start may be fractional) into out.length samples.
// clamp: repeat edge samples past the ends (images); otherwise they read as silence (audio).
export function resample(
  src: Float32Array,
  start: number,
  len: number,
  out: Float32Array,
  m: Method,
  clamp: boolean,
) {
  const n = out.length,
    step = len / n,
    last = src.length - 1;
  const at = (i: number) =>
    clamp
      ? src[Math.min(last, Math.max(0, i))]
      : i < 0 || i > last
        ? 0
        : src[i];
  for (let j = 0; j < n; j++) {
    const a = start + j * step;
    if (m === "area") {
      // box average with fractional edge weights; a box under one sample is just that sample
      const b = a + step;
      let s = 0;
      for (let i = Math.floor(a); i < b; i++)
        s += (Math.min(b, i + 1) - Math.max(a, i)) * at(i);
      out[j] = s / step;
    } else if (m === "nearest") {
      out[j] = at(Math.floor(a + step / 2));
    } else {
      const p = a + step / 2 - 0.5, // sample i sits at i, output centres at the box middle
        i = Math.floor(p),
        f = p - i,
        p1 = at(i),
        p2 = at(i + 1);
      if (m === "linear") out[j] = p1 + (p2 - p1) * f;
      else {
        const p0 = at(i - 1),
          p3 = at(i + 2); // Catmull-Rom
        out[j] =
          0.5 *
          (2 * p1 +
            (p2 - p0) * f +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
            (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
      }
    }
  }
}

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    for (; j & b; b >>= 1) j ^= b;
    j ^= b;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1)
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const a = (-2 * Math.PI * k) / len,
          c = Math.cos(a),
          s = Math.sin(a),
          u = i + k,
          v = u + len / 2,
          tr = re[v] * c - im[v] * s,
          ti = re[v] * s + im[v] * c;
        re[v] = re[u] - tr;
        im[v] = im[u] - ti;
        re[u] += tr;
        im[u] += ti;
      }
}

// nf × n/2 harmonic magnitudes -> nf × n samples, zero phase, globally normalized.
// Real symmetric spectra have real FFTs, so fft() suffices as the inverse.
export function spectral(g: Float32Array, nf: number, n: number) {
  const h = n / 2,
    out = new Float32Array(nf * n),
    re = new Float32Array(n),
    im = new Float32Array(n);
  for (let k = 0; k < nf; k++) {
    re.fill(0);
    im.fill(0);
    for (let j = 0; j < h; j++) {
      re[j + 1] = g[k * h + j];
      if (j < h - 1) re[n - j - 1] = g[k * h + j];
    }
    fft(re, im);
    out.set(re, k * n);
  }
  const peak = out.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
  return peak ? out.map((v) => v / peak) : out;
}
