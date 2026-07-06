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
    const waveLength = this.currentWaveform.length;

    if (!output || output.length === 0 || waveLength === 0) {
      return true;
    }

    const blockSize = output[0].length;
    const frequencies = parameters["frequency"];
    const isFreqConstant = frequencies.length === 1;

    for (let i = 0; i < blockSize; i++) {
      const freq = isFreqConstant ? frequencies[0] : frequencies[i];
      const phaseIncrement = (freq * waveLength) / sampleRate;

      const index = Math.floor(this.phase);
      const nextIndex = (index + 1) % waveLength;
      const t = this.phase - index;

      const s0 = this.currentWaveform[index];
      const s1 = this.currentWaveform[nextIndex];
      const interpolatedSample = s0 + t * (s1 - s0);

      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = interpolatedSample;
      }

      this.phase = (this.phase + phaseIncrement) % waveLength;
    }

    return true;
  }
}

registerProcessor("waveform-player-processor", WaveformPlayerProcessor);
