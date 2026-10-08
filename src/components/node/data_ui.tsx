import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import AudioLines from "lucide-solid/icons/audio-lines";
import ImageIcon from "lucide-solid/icons/image";
import { FRAME as N, MAX_FRAMES as MAX } from "../../wasm/wav";
import { Flags, Head, Knobs, Scope, useNode } from "./node";
import {
  decodeAudio,
  decodeImage,
  pending,
  registerData,
  TYPES,
  type Asset,
  type Audio,
  type Img,
  type Spec,
} from "./data_asset";
import { resample, spectral, type Method } from "./resample";
import css from "./data_ui.module.css";

// Data nodes re-render the original import via `put` on each edit.
// Editors expose settings as Spec, saved alongside the original bytes.
type Put = (d: Float32Array) => void;

const AUDIO = "#2fbf8f",
  IMAGE = "#f0629a",
  BW = 308, // canvas css width: node is 320 wide minus padding and border
  UH = 52,
  CH = 92;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
// Saved settings come from a file: anything missing or odd falls back to the default
const int = (s: string | undefined, lo: number, hi: number, d: number) => {
  const v = Math.round(+(s ?? NaN));
  return Number.isFinite(v) ? clamp(v, lo, hi) : d;
};
const pick = <T extends string>(
  s: string | undefined,
  all: readonly T[],
  d: T,
) => (all.includes(s as T) ? (s as T) : d);

// 2x backing store for crisp lines; draw in css px
function canvas(c: HTMLCanvasElement, h: number) {
  c.width = BW * 2;
  c.height = h * 2;
  const g = c.getContext("2d")!;
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.clearRect(0, 0, BW, h);
  return g;
}

const frac = (e: PointerEvent, axis: "clientX" | "clientY") => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return axis === "clientX"
    ? (e.clientX - r.left) / r.width
    : (e.clientY - r.top) / r.height;
};

// pointer capture drag: f runs on press and on every move while held
const drag = (f: (e: PointerEvent) => void) => ({
  down: (e: PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    f(e);
  },
  move: (e: PointerEvent) =>
    (e.currentTarget as Element).hasPointerCapture(e.pointerId) && f(e),
});

const METHODS = [
  ["nearest", "Nearest"],
  ["linear", "Linear"],
  ["cubic", "Cubic"],
  ["area", "Area"],
] as const;
const METHOD_IDS = METHODS.map((m) => m[0]);
const NONE = [["none", "None"]] as const;
const MODES = [
  ["time", "Time"],
  ["spectral", "Spectral"],
] as const;
const CHANNELS = [
  ["avg", "Average"],
  ["r", "Red"],
  ["g", "Green"],
  ["b", "Blue"],
] as const;

function Opt(props: { label: string; children: any }) {
  return (
    <label class={css.opt}>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function Sel(props: {
  value: () => string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      disabled={props.disabled}
      on:change={(e) => props.onChange(e.currentTarget.value)}
    >
      <For each={props.options}>
        {([v, l]) => (
          <option value={v} selected={v === props.value()}>
            {l}
          </option>
        )}
      </For>
    </select>
  );
}

function Num(props: {
  value: () => number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={props.min}
      max={props.max}
      step={1}
      value={props.value()}
      on:change={(e) => {
        const v = Math.round(+e.currentTarget.value);
        if (Number.isFinite(v)) props.onChange(clamp(v, props.min, props.max));
        e.currentTarget.value = `${props.value()}`; // show the clamped value even if the signal didn't change
      }}
    />
  );
}

// [min, max] per column over samples [a, b); outside the clip reads as 0
function peaks(x: Float32Array, a: number, b: number, cols: number) {
  const pk = new Float32Array(cols * 2);
  for (let c = 0; c < cols; c++) {
    const i0 = Math.floor(a + ((b - a) * c) / cols),
      i1 = Math.max(i0 + 1, Math.floor(a + ((b - a) * (c + 1)) / cols));
    let lo = Infinity,
      hi = -Infinity;
    for (let i = i0; i < i1; i++) {
      const v = i < 0 || i >= x.length ? 0 : x[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    pk[c * 2] = lo;
    pk[c * 2 + 1] = hi;
  }
  return pk;
}

function wave(g: CanvasRenderingContext2D, pk: Float32Array, h: number) {
  const cols = pk.length / 2,
    w = BW / cols,
    mid = h / 2;
  g.fillStyle = "rgba(128,128,128,.4)";
  g.fillRect(0, mid, BW, 0.5);
  g.fillStyle = AUDIO;
  for (let c = 0; c < cols; c++) {
    const lo = clamp(pk[c * 2], -1, 1),
      hi = clamp(pk[c * 2 + 1], -1, 1);
    g.fillRect(c * w, mid - hi * mid, w, Math.max((hi - lo) * mid, 0.5));
  }
}

function frameRect(
  g: CanvasRenderingContext2D,
  x: number,
  w: number,
  h: number,
  k: number,
) {
  g.globalAlpha = k % 2 ? 0.14 : 0.3; // alternate so neighbouring frames stay distinguishable
  g.fillStyle = AUDIO;
  g.fillRect(x, 0, Math.max(w, 1), h);
  g.globalAlpha = 0.8;
  g.fillRect(x, 0, 1, h);
  g.globalAlpha = 1;
}

function AudioEditor(props: {
  a: Audio;
  put: Put;
  init: Spec;
  reg: (get: () => Spec) => void;
}) {
  const x = props.a.x,
    len = x.length,
    maxWin = Math.max(2, len),
    i = props.init;
  const [win, setWin] = createSignal(int(i.Win, 2, maxWin, N));
  const [method, setMethod] = createSignal(
    pick<Method>(i.Rsm, METHOD_IDS, "linear"),
  );
  const [frames, setFrames] = createSignal(
    int(i.Frm, 1, MAX, clamp(Math.floor(len / N), 1, MAX)),
  );
  const [start, setStart] = createSignal(int(i.Str, 0, len - 1, 0));
  const [auto, setAuto] = createSignal(i.Frm === "auto"); // as many frames as fit from start (max 256)
  // What the zoomed waveform shows, and its left edge. Both only change in focus(), so
  // resizing the window by dragging doesn't rescale the view under the pointer.
  const [span, setSpan] = createSignal(Math.max(win() * 2, 512));
  const [vs, setVs] = createSignal(start() - span() / 4);
  const nf = () =>
    Math.min(
      auto() ? MAX : frames(),
      Math.max(1, Math.ceil((len - start()) / win())),
    );

  const goto = (s: number) => setStart(clamp(Math.round(s), 0, len - 1));
  const focus = () => {
    const sp = Math.max(win() * 2, 512);
    setSpan(sp);
    setVs(start() - sp / 4);
  };
  let resizing = false;
  const size = (at: number) => {
    resizing = true;
    setWin(clamp(Math.round(at - start()), 2, maxWin));
  };
  const done = () => resizing && ((resizing = false), focus());

  props.reg(() => ({
    Typ: TYPES.audio,
    Mod: "time",
    Win: `${win()}`,
    Str: `${start()}`,
    Frm: auto() ? "auto" : `${frames()}`,
    Rsm: method(),
  }));

  createEffect(() => {
    const w = win(),
      s = start(),
      m = method(),
      out = new Float32Array(nf() * N);
    for (let k = 0; k < nf(); k++) {
      const o = out.subarray(k * N, (k + 1) * N);
      if (w === N) for (let i = 0; i < N; i++) o[i] = x[s + k * w + i] ?? 0;
      else resample(x, s + k * w, w, o, m, false);
    }
    props.put(out);
  });

  let up!: HTMLCanvasElement, dn!: HTMLCanvasElement;
  const whole = createMemo(() => peaks(x, 0, len, BW * 2));
  createEffect(() => {
    const g = canvas(up, UH),
      w = win(),
      s = start();
    wave(g, whole(), UH);
    for (let k = 0; k < nf(); k++)
      frameRect(g, ((s + k * w) / len) * BW, (w / len) * BW, UH, k);
  });
  createEffect(() => {
    const g = canvas(dn, UH),
      w = win(),
      s = start(),
      a = vs(),
      sp = span();
    wave(g, peaks(x, a, a + sp, BW * 2), UH);
    for (let k = 0; k < nf(); k++) {
      const f = s + k * w;
      if (f + w >= a && f <= a + sp)
        frameRect(g, ((f - a) / sp) * BW, (w / sp) * BW, UH, k);
    }
    g.fillStyle = "#ffb020"; // start marker
    g.fillRect(((s - a) / sp) * BW - 0.75, 0, 1.5, UH);
  });

  // alt+drag: the window's right edge follows the pointer, start stays put
  const coarse = drag((e) =>
    e.altKey
      ? size(frac(e, "clientX") * len)
      : (goto(frac(e, "clientX") * len), focus()),
  );
  // Press jumps start to the pointer; after that, dragging moves it relatively, so the view can
  // re-centre on start whenever it leaves the zoomed range without the pointer mapping jumping.
  let s0 = 0,
    x0 = 0;
  const fine = drag((e) => {
    const f = frac(e, "clientX");
    if (e.altKey) return size(vs() + f * span());
    if (e.type === "pointerdown")
      return (goto(vs() + f * span()), (s0 = start()), (x0 = f));
    goto(s0 + (f - x0) * span());
    // as soon as the first window starts to spill out of the view, centre the view on it
    if (start() < vs() || start() + win() > vs() + span())
      setVs(start() + (win() - span()) / 2);
  });

  return (
    <>
      <canvas
        ref={up}
        title="Alt+drag: resize window"
        class={`${css.wave} ${css.up}`}
        on:pointerdown={coarse.down}
        on:pointermove={coarse.move}
        on:pointerup={done}
      />
      <canvas
        ref={dn}
        title="Alt+drag: resize window"
        class={`${css.wave} ${css.down}`}
        on:pointerdown={fine.down}
        on:pointermove={fine.move}
        on:pointerup={done}
      />
      <div class={css.opts}>
        <Opt label="Window">
          <Num
            value={win}
            min={2}
            max={maxWin}
            onChange={(v) => (setWin(v), focus())}
          />
        </Opt>
        <Opt label="Resample">
          <Sel
            value={() => (win() === N ? "none" : method())}
            options={win() === N ? NONE : METHODS}
            disabled={win() === N}
            onChange={(v) => setMethod(v as Method)}
          />
        </Opt>
        <Opt label="Frames">
          <Num
            value={nf}
            min={1}
            max={MAX}
            onChange={(v) => (setAuto(false), setFrames(v))}
          />
          <button
            class={css.tog}
            classList={{ [css.on]: auto() }}
            title="Use as many frames as fit"
            onClick={() => (auto() && setFrames(nf()), setAuto(!auto()))}
          >
            Auto
          </button>
        </Opt>
        <Opt label="Start">
          <Num
            value={start}
            min={0}
            max={len - 1}
            onChange={(v) => (goto(v), focus())}
          />
        </Opt>
      </div>
    </>
  );
}

type Crop = [x0: number, y0: number, x1: number, y1: number];

// any two opposite corners -> a whole-pixel rectangle at least 1x1, inside the w x h image
const fitCrop = (
  w: number,
  h: number,
  a: number,
  b: number,
  c: number,
  d: number,
): Crop => {
  const x0 = clamp(Math.round(Math.min(a, c)), 0, w - 1),
    y0 = clamp(Math.round(Math.min(b, d)), 0, h - 1);
  return [
    x0,
    y0,
    clamp(Math.round(Math.max(a, c)), x0 + 1, w),
    clamp(Math.round(Math.max(b, d)), y0 + 1, h),
  ];
};

function ImageEditor(props: {
  a: Img;
  put: Put;
  init: Spec;
  reg: (get: () => Spec) => void;
}) {
  const { w, h, rgba } = props.a,
    i = props.init;
  const cr = (i.Crp ?? "").split(/[\s,]+/).map(Number);
  const [crop, setCrop] = createSignal<Crop>(
    cr.length === 4 && cr.every(Number.isFinite)
      ? fitCrop(w, h, cr[0], cr[1], cr[2], cr[3])
      : [0, 0, w, h],
  );
  const [mode, setMode] = createSignal(
    pick(i.Mod, ["time", "spectral"], "time"),
  ); // rows are waveforms, or magnitude spectra (left = low)
  const [chan, setChan] = createSignal(
    pick(
      i.Chn,
      CHANNELS.map((c) => c[0]),
      "avg",
    ),
  );
  const [method, setMethod] = createSignal(
    pick<Method>(i.Rsm, METHOD_IDS, "linear"),
  );
  const [frames, setFrames] = createSignal(
    int(i.Frm, 1, MAX, Math.min(MAX, h)),
  );
  props.reg(() => ({
    Typ: TYPES.image,
    Mod: mode(),
    Chn: chan(),
    Crp: crop().join(" "),
    Frm: `${frames()}`,
    Rsm: method(),
  }));
  const [rev, setRev] = createSignal(0); // bumped when a crop drag ends: re-rendering mid-drag is wasteful

  const s = Math.min(BW / w, CH / h),
    ox = (BW - w * s) / 2,
    oy = (CH - h * s) / 2;

  const plane = createMemo(() => {
    const c = chan(),
      p = new Float32Array(w * h);
    for (let i = 0; i < p.length; i++) {
      const r = rgba[i * 4],
        g = rgba[i * 4 + 1],
        b = rgba[i * 4 + 2];
      p[i] =
        (c === "r" ? r : c === "g" ? g : c === "b" ? b : (r + g + b) / 3) / 255;
    }
    return p;
  });

  // crop rows -> W wide, then crop columns -> `frames` tall; time: sample = value * 2 - 1
  const bins = () => (mode() === "spectral" ? N / 2 : N);
  createEffect(() => {
    rev();
    const pl = plane(),
      m = method(),
      nf = frames(),
      W = bins(),
      [x0, y0, x1, y1] = untrack(crop),
      cw = x1 - x0,
      ch = y1 - y0,
      mid = new Float32Array(ch * W),
      grid = new Float32Array(nf * W),
      col = new Float32Array(ch),
      res = new Float32Array(nf);
    for (let y = 0; y < ch; y++)
      resample(
        pl.subarray((y0 + y) * w, (y0 + y + 1) * w),
        x0,
        cw,
        mid.subarray(y * W, (y + 1) * W),
        m,
        true,
      );
    for (let i = 0; i < W; i++) {
      for (let y = 0; y < ch; y++) col[y] = mid[y * W + i];
      resample(col, 0, ch, res, m, true);
      for (let k = 0; k < nf; k++) grid[k * W + i] = res[k];
    }
    props.put(
      mode() === "spectral"
        ? spectral(grid, nf, N)
        : grid.map((v) => v * 2 - 1),
    );
  });

  let cv!: HTMLCanvasElement;
  createEffect(() => {
    const g = canvas(cv, CH),
      [x0, y0, x1, y1] = crop(),
      X0 = ox + x0 * s,
      Y0 = oy + y0 * s,
      X1 = ox + x1 * s,
      Y1 = oy + y1 * s;
    g.drawImage(props.a.cv, ox, oy, w * s, h * s);
    g.fillStyle = "rgba(0,0,0,.55)";
    g.fillRect(ox, oy, w * s, Y0 - oy);
    g.fillRect(ox, Y1, w * s, oy + h * s - Y1);
    g.fillRect(ox, Y0, X0 - ox, Y1 - Y0);
    g.fillRect(X1, Y0, ox + w * s - X1, Y1 - Y0);
    g.strokeStyle = g.fillStyle = IMAGE;
    g.lineWidth = 1.5;
    g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    for (const px of [X0, (X0 + X1) / 2, X1])
      for (const py of [Y0, (Y0 + Y1) / 2, Y1])
        if (px !== (X0 + X1) / 2 || py !== (Y0 + Y1) / 2)
          g.fillRect(px - 3, py - 3, 6, 6);
  });

  const at = (e: PointerEvent) => [
    (frac(e, "clientX") * BW - ox) / s,
    (frac(e, "clientY") * CH - oy) / s,
  ];
  const fit = (a: number, b: number, c: number, d: number) =>
    fitCrop(w, h, a, b, c, d);
  const hit = ([px, py]: number[]) => {
    const [x0, y0, x1, y1] = crop(),
      t = 7 / s, // 7 screen px
      inX = px > x0 - t && px < x1 + t,
      inY = py > y0 - t && py < y1 + t;
    return {
      l: inY && Math.abs(px - x0) < t,
      r: inY && Math.abs(px - x1) < t,
      t: inX && Math.abs(py - y0) < t,
      b: inX && Math.abs(py - y1) < t,
      move: inX && inY,
    };
  };

  let grab = hit([-1e9, -1e9]),
    p0 = [0, 0],
    c0: Crop = [0, 0, w, h],
    creating = false;
  const cur = (m: ReturnType<typeof hit>) =>
    (m.l && m.t) || (m.r && m.b)
      ? "nwse-resize"
      : (m.r && m.t) || (m.l && m.b)
        ? "nesw-resize"
        : m.l || m.r
          ? "ew-resize"
          : m.t || m.b
            ? "ns-resize"
            : m.move
              ? "move"
              : "crosshair";

  const onDown = (e: PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    p0 = at(e);
    c0 = crop();
    grab = hit(p0);
    creating = !(grab.l || grab.r || grab.t || grab.b || grab.move);
  };
  const onMove = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement,
      [px, py] = at(e);
    if (!el.hasPointerCapture(e.pointerId))
      return void (el.style.cursor = cur(hit([px, py])));
    const [x0, y0, x1, y1] = c0;
    if (creating) setCrop(fit(p0[0], p0[1], px, py));
    else if (grab.l || grab.r || grab.t || grab.b)
      setCrop(
        fit(
          grab.l ? px : x0,
          grab.t ? py : y0,
          grab.r ? px : x1,
          grab.b ? py : y1,
        ),
      );
    else {
      const dx = clamp(Math.round(px - p0[0]), -x0, w - x1),
        dy = clamp(Math.round(py - p0[1]), -y0, h - y1);
      setCrop([x0 + dx, y0 + dy, x1 + dx, y1 + dy]);
    }
  };

  return (
    <>
      <canvas
        ref={cv}
        class={`${css.wave} ${css.crop}`}
        on:pointerdown={onDown}
        on:pointermove={onMove}
        on:pointerup={() => setRev((r) => r + 1)}
      />
      <div class={css.opts}>
        <Opt label="Mode">
          <Sel value={mode} options={MODES} onChange={setMode} />
        </Opt>
        <Opt label="Channel">
          <Sel value={chan} options={CHANNELS} onChange={setChan} />
        </Opt>
        <Opt label="Resample">
          <Sel
            value={method}
            options={METHODS}
            onChange={(v) => setMethod(v as Method)}
          />
        </Opt>
        <Opt label="Frames">
          <Num value={frames} min={1} max={MAX} onChange={setFrames} />
        </Opt>
        <div class={css.info}>
          {crop()[2] - crop()[0]}×{crop()[3] - crop()[1]} → {bins()}
          {mode() === "spectral" ? " bins" : ""}×{frames()}
        </div>
      </div>
    </>
  );
}

export function DataView() {
  const ctx = useNode();
  const boot = pending.get(ctx.i); // set when a project is loaded
  pending.delete(ctx.i);
  let init: Spec | undefined = boot?.spec; // only the first editor starts from saved settings
  const [asset, setAsset] = createSignal<Asset | undefined>(boot?.asset);
  const [err, setErr] = createSignal("");
  let spec: (() => Spec) | undefined;
  onCleanup(
    registerData(
      () => ctx.el,
      () => {
        const a = asset();
        return (
          a &&
          spec && {
            bytes: a.bytes,
            spec: { ...spec(), Nam: a.name.replace(/[\r\n]+/g, " ") },
          }
        );
      },
    ),
  );

  const put: Put = (d) => {
    const p = ctx.wasm.data_alloc(+ctx.el!.dataset.n!, d.length / N);
    if (p < 0) return setErr("out of memory");
    // the view is made after the alloc: it may have grown (and detached) memory
    new Float32Array(ctx.wasm.memory.buffer, p, d.length).set(d);
    setErr("");
    ctx.redraw();
  };

  // dropping the import also drops the node's frames (silence, as for a fresh node)
  const clear = () => {
    ctx.wasm.data_free(+ctx.el!.dataset.n!);
    setErr("");
    setAsset();
    ctx.redraw();
  };

  const source = (
    accept: string,
    label: string,
    color: string,
    Icon: typeof AudioLines,
    dec: (b: Uint8Array, name: string) => Promise<Asset>,
  ) => {
    let file!: HTMLInputElement;
    return (
      <>
        <input
          ref={file}
          type="file"
          accept={accept}
          hidden
          on:change={async () => {
            const f = file.files?.[0];
            file.value = "";
            if (!f) return;
            try {
              setAsset(
                await dec(new Uint8Array(await f.arrayBuffer()), f.name),
              );
            } catch (e) {
              alert(`Could not read ${f.name}: ${(e as Error).message}`);
            }
          }}
        />
        <button
          class={css.ghost}
          style={{ "--c": color }}
          onClick={() => file.click()}
        >
          <Icon size={28} stroke-width={1.75} />
          {label}
        </button>
      </>
    );
  };

  return (
    <>
      <Head />
      <Knobs />
      <div
        class={css.body}
        style={{ "--c": asset()?.t === "image" ? IMAGE : AUDIO }}
        on:pointerdown={(e) => e.stopPropagation()}
        on:keydown={(e) => e.stopPropagation()}
      >
        <Show
          when={asset()}
          keyed
          fallback={
            <div class={css.pick}>
              {source("audio/*", "Audio", AUDIO, AudioLines, decodeAudio)}
              {source("image/*", "Image", IMAGE, ImageIcon, decodeImage)}
            </div>
          }
        >
          {(a) => {
            const saved = init ?? {};
            init = undefined;
            return (
              <>
                <div class={css.bar}>
                  <span class={css.name} title={a.name}>
                    {a.name}
                  </span>
                  <Show when={err()}>
                    <span class={css.err}>{err()}</span>
                  </Show>
                  <button
                    class={css.x}
                    title="Choose another source"
                    onClick={clear}
                  >
                    ×
                  </button>
                </div>
                {a.t === "audio" ? (
                  <AudioEditor
                    a={a}
                    put={put}
                    init={saved}
                    reg={(g) => (spec = g)}
                  />
                ) : (
                  <ImageEditor
                    a={a}
                    put={put}
                    init={saved}
                    reg={(g) => (spec = g)}
                  />
                )}
              </>
            );
          }}
        </Show>
      </div>
      <Flags />
      <Scope w={0} />
    </>
  );
}
