import wavetableNodeUrl from "./wavetable-node?worker&url";

export class WaveformPlayer {
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private sender: ((buf: Float32Array) => void) | null = null;
  private isPlaying: boolean = false;

  public _cached_vol = 0.1;
  public _cached_freq = 44;

  public onInit?: () => void;

  constructor() {}

  /**
   * Initializes the AudioContext, loads the worklet, and builds the routing graph.
   */
  async initialize(): Promise<void> {
    if (this.audioCtx) return;

    this.audioCtx = new AudioContext();

    await this.audioCtx.audioWorklet.addModule(wavetableNodeUrl);

    this.workletNode = new AudioWorkletNode(
      this.audioCtx,
      "waveform-player-processor",
      {
        outputChannelCount: [2],
      },
    );
    this.frequency.setValueAtTime(this._cached_freq, 0);

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(this._cached_vol, 0);

    this.workletNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);

    this.sender = this.createSender(this.workletNode);
    this.onInit?.();
  }

  /**
   * Pushes a new waveform buffer down to the audio thread.
   */
  setWaveform(buf: Float32Array): void {
    if (!this.sender) return;
    this.sender(buf);
  }

  /**
   * Exposes the frequency AudioParam for raw Web Audio automations.
   */
  get frequency(): AudioParam {
    if (!this.workletNode) throw new Error("Player not initialized");
    return this.workletNode.parameters.get("frequency")!;
  }

  /**
   * Exposes the volume AudioParam for raw Web Audio automations.
   */
  get volume(): AudioParam {
    if (!this.gainNode) throw new Error("Player not initialized");
    return this.gainNode.gain;
  }

  /**
   * Pauses audio processing by suspending the audio context.
   */
  async pause(): Promise<void> {
    if (!this.audioCtx || !this.isPlaying) return;
    await this.audioCtx.suspend();
    this.isPlaying = false;
  }

  /**
   * Resumes audio processing by resuming the audio context.
   */
  async resume(): Promise<void> {
    if (!this.audioCtx || this.isPlaying) return;
    await this.audioCtx.resume();
    this.isPlaying = true;
  }

  /**
   * Returns the current play/pause state.
   */
  get status(): "playing" | "paused" | "uninitialized" {
    if (!this.audioCtx) return "uninitialized";
    return this.isPlaying ? "playing" : "paused";
  }

  /**
   * Internal helper to handle zero-allocation transferable buffers.
   */
  private createSender(node: AudioWorkletNode) {
    return (buf: Float32Array) => {
      if (buf.length === 0) return;
      const sampleCopy = new Float32Array(buf.length);
      sampleCopy.set(buf);
      node.port.postMessage(
        { type: "WAVEFORM_DATA", buffer: sampleCopy.buffer },
        [sampleCopy.buffer],
      );
    };
  }
}

export const player = new WaveformPlayer();
