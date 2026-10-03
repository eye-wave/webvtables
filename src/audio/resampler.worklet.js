class Resampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.table = new Float32Array(2048);
    this.pos = 0;
    this.freq = 220;
    this.volume = 0;
    this.playing = false;
    this.gain = 0;
    this.port.onmessage = ({ data }) => Object.assign(this, data);
  }

  process(_, outputs) {
    const out = outputs[0][0];
    const t = this.table;
    const n = t.length;
    const inc = (this.freq * n) / sampleRate;
    const target = this.playing ? this.volume : 0;

    for (let i = 0; i < out.length; i++) {
      this.gain += (target - this.gain) * 0.002;

      const i0 = this.pos | 0;
      const f = this.pos - i0;
      const s = (t[i0] * (1 - f) + t[(i0 + 1) % n] * f) * this.gain;

      out[i] = s > 1 ? 1 : s < -1 ? -1 : s || 0;
      this.pos += inc;
      while (this.pos >= n) this.pos -= n;
    }
    return true;
  }
}

registerProcessor("resampler", Resampler);
