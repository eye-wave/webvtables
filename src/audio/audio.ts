import workletUrl from "./resampler.worklet.js?worker&url";

export const TABLE = 2048;

export enum Held {
  Away,
  Narrow,
}

export function createAudio() {
  let ctx: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let ready: Promise<void> | undefined;
  let table = new Float32Array(TABLE);
  let freq = 220;
  let volume = 0.25;
  let playing = false;
  const held = new Set<Held>();
  const live = () => playing && !held.size;

  const send = (m: object) => node?.port.postMessage(m);

  const start = async () => {
    ctx = new AudioContext();
    await ctx.audioWorklet.addModule(workletUrl);
    node = new AudioWorkletNode(ctx, "resampler", {
      numberOfInputs: 0,
      outputChannelCount: [1],
    });
    node.connect(ctx.destination);
    send({ table, freq, volume, playing: live() });
  };

  const pause = () => {
    playing = false;
    send({ playing: false });
    setTimeout(() => !playing && ctx?.suspend(), 200);
  };

  return {
    async toggle(): Promise<boolean> {
      if (playing) return (pause(), false);
      playing = true;
      try {
        ready ??= start();
        await ready;
        await ctx!.resume();
      } catch (e) {
        console.error(e);
        ready = undefined;
        return (playing = false);
      }
      send({ playing: live() });
      return playing;
    },

    pause,

    hold(why: Held, on: boolean) {
      held[on ? "add" : "delete"](why);
      send({ playing: live() });
    },

    setFreq(hz: number) {
      send({ freq: (freq = hz) });
    },

    setVolume(v: number) {
      send({ volume: (volume = v) });
    },

    table(t: Float32Array<ArrayBuffer>) {
      if (t.length === table.length && t.every((v, i) => v === table[i]))
        return;
      send({ table: (table = t) });
    },
  };
}

export type Audio = ReturnType<typeof createAudio>;
