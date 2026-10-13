import type { WasmExports } from "../../wasm";

// Data stores the original file bytes for saving and the browser-decoded content.
// Browsers handle decoding; WASM needs no codecs or libraries.
export type Spec = Record<string, string>;
export type Audio = {
  t: "audio";
  name: string;
  bytes: Uint8Array;
  x: Float32Array;
};
export type Img = {
  t: "image";
  name: string;
  bytes: Uint8Array;
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  cv: HTMLCanvasElement;
};
export type Asset = Audio | Img;

export const TYPES = { audio: "sampl_pts", image: "pixels" } as const;

export async function decodeAudio(
  bytes: Uint8Array,
  name: string,
): Promise<Audio> {
  const b = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(
    bytes.slice().buffer,
  );
  const x = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] += d[i] / b.numberOfChannels;
  }
  return { t: "audio", name, bytes, x };
}

export async function decodeImage(
  bytes: Uint8Array,
  name: string,
): Promise<Img> {
  const bmp = await createImageBitmap(
      new Blob([bytes as Uint8Array<ArrayBuffer>]),
    ),
    cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const { data } = g.getImageData(0, 0, cv.width, cv.height);
  return { t: "image", name, bytes, w: cv.width, h: cv.height, rgba: data, cv };
}

export function decode(
  typ: string | undefined,
  bytes: Uint8Array,
  name: string,
): Promise<Asset> {
  if (typ === TYPES.audio) return decodeAudio(bytes, name);
  if (typ === TYPES.image) return decodeImage(bytes, name);
  throw new Error(`unknown asset type ${typ}`);
}

export const pending = new Map<number, { asset: Asset; spec: Spec }>();

// Copies `d` into the node's wasm storage (the engine reads it from there); false if it was refused.
export const store = (wasm: WasmExports, node: number, d: Float32Array) => {
  const p = wasm.data_alloc(node, d.length);
  // the view is made after the alloc: it may have grown (and detached) memory
  if (p >= 0) new Float32Array(wasm.memory.buffer, p, d.length).set(d);
  return p >= 0;
};

// The Waveshaper's asset is its points: x y pairs as raw float32, no codec, no settings.
// Like Math's LaTeX they are read straight from the asset (see project.ts) and wait here for the node view.
export type Pt = readonly [x: number, y: number];
export const ptsBoot = new Map<number, Pt[]>();
export const encodePoints = (p: readonly Pt[]) => Float32Array.from(p.flat());
// Whole pairs only; anything odd in a file (stray bytes, NaN, out of range) is repaired.
export const decodePoints = (b: Uint8Array): Pt[] => {
  const f = new Float32Array(b.slice(0, b.length & ~7).buffer);
  const v = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(-1, x)) : 0);
  return Array.from({ length: f.length / 2 }, (_, i) => [v(f[2 * i]), v(f[2 * i + 1])]);
};

// The Draw Filter's asset is its curve: 256 y values (-1..1) as raw float32. Same handling as the points.
export const DRAW_POINTS = 256;
export const drawBoot = new Map<number, Float32Array>();
export const decodeDraw = (b: Uint8Array) => {
  const f = new Float32Array(DRAW_POINTS);
  new Uint8Array(f.buffer).set(b.subarray(0, 4 * DRAW_POINTS));
  return f.map((x) => (Number.isFinite(x) ? Math.min(1, Math.max(-1, x)) : 0));
};

export type Saved = { bytes: Uint8Array; spec: Spec };
const live = new Set<{
  el: () => HTMLElement | undefined;
  get: () => Saved | undefined;
}>();
export const registerData = (
  el: () => HTMLElement | undefined,
  get: () => Saved | undefined,
) => {
  const e = { el, get };
  live.add(e);
  return () => live.delete(e);
};
export const savedAt = (n: number) => {
  for (const e of live) if (e.el() && +e.el()!.dataset.n! === n) return e.get();
};

// An element the overlay draws a Data image into (see gfx/overlay.ts). The function gets the
// element's inner size and returns rects relative to its top-left corner: the picture and the crop box.
export type ImageView = {
  src: HTMLCanvasElement;
  img: [x: number, y: number, w: number, h: number];
  box: [x0: number, y0: number, x1: number, y1: number];
};
export const imageViews = new WeakMap<
  Element,
  (w: number, h: number) => ImageView
>();

// The audio counterpart: peaks are [min, max] pairs, under/over are rects (x y w h r g b a) relative
// to the element's top-left corner.
export type PanelView = {
  peaks: Float32Array;
  color: [number, number, number];
  under: number[];
  over: number[];
};
export const panelViews = new WeakMap<
  Element,
  (w: number, h: number) => PanelView
>();
