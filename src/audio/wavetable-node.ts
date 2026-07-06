interface AudioParamDescriptor {
  name: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  automationRate?: "a-rate" | "k-rate";
}

interface WaveformMessageEvent extends MessageEvent {
  data: {
    type: "WAVEFORM_DATA";
    buffer: ArrayBufferLike;
  };
}

class WaveformPlayerProcessor extends AudioWorkletProcessor {
  private currentWaveform: Float32Array = new Float32Array(0);
  private phase: number = 0.0;

  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        name: "frequency",
        defaultValue: 35.2,
        minValue: 0.0,
        maxValue: 12000.0,
        automationRate: "a-rate",
      },
    ];
  }

  constructor() {
    super();
    this.port.onmessage = (event: WaveformMessageEvent) => {
      if (event.data?.type === "WAVEFORM_DATA") {
        this.currentWaveform = new Float32Array(event.data.buffer);
      }
    };
  }

  public process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0];
    const wave = this.currentWaveform;
    const waveLength = wave.length;
    const numChannels = output ? output.length : 0;

    if (!numChannels || waveLength === 0) {
      return true;
    }

    const channel0 = output[0];
    const blockSize = channel0.length;
    const frequencies = parameters["frequency"];
    const isFreqConstant = frequencies.length === 1;

    const phaseScale = waveLength / sampleRate;
    let phase = this.phase;

    const constIncrement = isFreqConstant ? frequencies[0] * phaseScale : 0;

    for (let i = 0; i < blockSize; i++) {
      const index = phase | 0;
      let nextIndex = index + 1;
      if (nextIndex === waveLength) nextIndex = 0;

      const t = phase - index;
      const s0 = wave[index];
      const s1 = wave[nextIndex];
      const sample = s0 + t * (s1 - s0);

      channel0[i] = sample;
      for (let channel = 1; channel < numChannels; channel++) {
        output[channel][i] = sample;
      }

      const increment = isFreqConstant
        ? constIncrement
        : frequencies[i] * phaseScale;
      phase += increment;
      if (phase >= waveLength) phase -= waveLength;
    }

    this.phase = phase;
    return true;
  }
}

registerProcessor("waveform-player-processor", WaveformPlayerProcessor);
