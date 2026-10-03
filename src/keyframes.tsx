import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createStore, produce } from "solid-js/store";

const FRAMES = 255, // wavetable frame index range, 0..255
  LABEL = 148,
  PADX = 10, // keeps the chips at 0 and 255 inside the track
  H = 72, // lane height
  PADY = 10,
  RULER = 24,
  INNER = H - 2 * PADY;
const hue = (i: number) => `hsl(${(210 + i * 67) % 360} 85% 68%)`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Key = { id: number; t: number; v: number };
// a lane with `lfo` renders a generated wave, otherwise it holds point keyframes
type Lane = { id: number; name: string; keys: Key[]; lfo?: number[] };
let uid = 0;

// every lfo param is a 0..1 knob, same range and drag feel as the node knobs
const SHAPES = ["Sine", "Tri", "Saw", "Square"];
const LFO = [
  {
    name: "shape",
    def: 0,
    text: (v: number) => SHAPES[Math.min(3, Math.floor(v * 4))],
  },
  { name: "phase", def: 0, text: (v: number) => `${Math.round(v * 360)}°` },
  { name: "amp", def: 1, text: (v: number) => `${Math.round(v * 100)}%` },
  { name: "freq", def: 0.2, text: (v: number) => `${(32 ** v).toFixed(2)}×` }, // cycles per 0..255, 1..32
  { name: "skew", def: 0.5, text: (v: number) => v.toFixed(2) },
] as const;

// ponytail: 4 shapes, skew warps the phase around a moved midpoint (0.5 = neutral)
const wave = ([shape, phase, amp, freq, skew]: number[], t: number) => {
  const p = ((32 ** freq * t) / FRAMES + phase) % 1;
  const k = clamp(skew, 0.01, 0.99);
  const q = p < k ? (0.5 * p) / k : 0.5 + (0.5 * (p - k)) / (1 - k);
  const w = [
    Math.sin(2 * Math.PI * q),
    q < 0.5 ? 4 * q - 1 : 3 - 4 * q,
    2 * q - 1,
    q < 0.5 ? 1 : -1,
  ][Math.min(3, Math.floor(shape * 4))];
  return 0.5 + 0.5 * amp * w;
};

export function Keyframes() {
  const [s, set] = createStore<{ lanes: Lane[] }>({ lanes: [] });
  const [width, setWidth] = createSignal(0);
  const [mult, setMult] = createSignal(1); // ctrl+wheel zoom, 1 = whole 0..255 fits
  const [head, setHead] = createSignal(0);
  const [sel, setSel] = createSignal<number>();
  let scroll!: HTMLDivElement;

  onMount(() => {
    const ro = new ResizeObserver(() => setWidth(scroll.clientWidth));
    ro.observe(scroll);
    onCleanup(() => ro.disconnect());
  });

  // px per frame; the -1 absorbs subpixel rounding so the fitted view never scrolls in x
  const z = () =>
    (Math.max(width() - LABEL - 2 * PADX - 1, FRAMES) / FRAMES) * mult();
  const X = (t: number) => PADX + t * z();
  const Y = (v: number) => PADY + (1 - v) * INNER;
  const frameAt = (e: MouseEvent, track: Element) =>
    clamp(
      Math.round((e.clientX - track.getBoundingClientRect().left - PADX) / z()),
      0,
      FRAMES,
    );

  const drag = (e: PointerEvent, move: (e: PointerEvent) => void) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    el.onpointermove = move;
    el.onpointerup = () => (el.onpointermove = el.onpointerup = null);
    move(e);
  };

  // tooltip sits above the chip, flips below / aligns to the other edge when it would leave the visible lane area
  const place = (chip: HTMLElement) => {
    const tip = chip.firstElementChild as HTMLElement;
    const c = chip.getBoundingClientRect(),
      v = scroll.getBoundingClientRect();
    const [w, h, gap] = [tip.offsetWidth, tip.offsetHeight, 6];
    const [l, t, r, b] = [
      v.left + LABEL,
      v.top + RULER,
      v.left + scroll.clientWidth,
      v.top + scroll.clientHeight,
    ];
    const cx = c.left + c.width / 2;
    const above = c.top - gap - h >= t || c.bottom + gap + h > b;
    tip.style.top = `${above ? -h - gap : c.height + gap}px`;
    tip.style.left = `${cx - w / 2 < l ? 0 : cx + w / 2 > r ? c.width - w : (c.width - w) / 2}px`;
  };

  // hold the first/last value outward, interpolate by drawing straight segments between keys
  const points = (l: Lane) => {
    if (l.lfo) {
      const lfo = [...l.lfo]; // read every param so the line tracks the knobs
      return Array.from({ length: FRAMES * 2 + 1 }, (_, i) => [
        i / 2,
        wave(lfo, i / 2),
      ]);
    }
    const k = [...l.keys].sort((a, b) => a.t - b.t);
    if (!k.length) return [];
    return [
      [0, k[0].v],
      ...k.map((x) => [x.t, x.v]),
      [FRAMES, k[k.length - 1].v],
    ];
  };
  const line = (l: Lane) =>
    points(l)
      .map(([t, v]) => `${X(t)},${Y(v)}`)
      .join(" ");
  const area = (l: Lane) =>
    points(l).length ? `${X(0)},${H} ${line(l)} ${X(FRAMES)},${H}` : "";

  return (
    <div
      class="kf"
      tabindex="0"
      onKeyDown={(e) => {
        const id = sel();
        if (id === undefined || e.target instanceof HTMLInputElement) return;
        if (e.key !== "Delete" && e.key !== "Backspace") return;
        set("lanes", {}, "keys", (ks) => ks.filter((k) => k.id !== id));
        setSel();
      }}
      onWheel={(e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setMult((m) => clamp(m * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 16));
      }}
    >
      <div
        class="kf-scroll"
        ref={scroll}
        style={{
          "--z": `${z()}px`,
          "--x0": `${PADX}px`,
          "--label": `${LABEL}px`,
          "--h": `${H}px`,
        }}
      >
        <div
          class="kf-inner"
          style={{ width: `${LABEL + 2 * PADX + FRAMES * z()}px` }}
        >
          <div class="kf-row kf-ruler">
            <div class="kf-label">
              {[false, true].map((lfo) => (
                <button
                  onClick={() =>
                    set("lanes", (l) => [
                      ...l,
                      {
                        id: ++uid,
                        name: `${lfo ? "LFO" : "Points"} ${l.filter((x) => !!x.lfo === lfo).length + 1}`,
                        keys: [],
                        lfo: lfo ? LFO.map((p) => p.def) : undefined,
                      },
                    ])
                  }
                >
                  {lfo ? "+ LFO" : "+ Points"}
                </button>
              ))}
            </div>
            <div
              class="kf-track"
              onPointerDown={(e) => {
                const track = e.currentTarget;
                drag(e, (m) => setHead(frameAt(m, track)));
              }}
            >
              <For each={[0, 32, 64, 96, 128, 160, 192, 224, 255]}>
                {(f) => (
                  <span
                    class="kf-tick"
                    classList={{ end: f === 255 }}
                    style={{ left: `${X(f)}px` }}
                  >
                    {f}
                  </span>
                )}
              </For>
            </div>
          </div>

          <For each={s.lanes}>
            {(l, i) => (
              <div class="kf-row kf-lane" style={{ "--c": hue(i()) }}>
                <div class="kf-label">
                  <i />
                  <input
                    value={l.name}
                    onInput={(e) =>
                      set("lanes", i(), "name", e.currentTarget.value)
                    }
                  />
                  <button
                    title="Remove lane"
                    onClick={() =>
                      set("lanes", (x) => x.filter((y) => y.id !== l.id))
                    }
                  >
                    ×
                  </button>
                </div>
                <div
                  class="kf-track"
                  onDblClick={(e) => {
                    if (l.lfo || (e.target as Element).closest(".kf-key"))
                      return;
                    const y =
                      e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const k = {
                      id: ++uid,
                      t: frameAt(e, e.currentTarget),
                      v: clamp(1 - (y - PADY) / INNER, 0, 1),
                    };
                    set("lanes", i(), "keys", (ks) => [...ks, k]);
                    setSel(k.id);
                  }}
                >
                  <Show when={l.lfo}>
                    <div class="kf-lfo">
                      <div class="kf-knobs">
                        {LFO.map((P, j) => (
                          <div
                            class="kf-knob"
                            style={{ "--v": l.lfo![j] }}
                            title={`${P.name} (double-click to reset)`}
                            onPointerDown={(e) => {
                              const [y0, v0] = [e.clientY, l.lfo![j]];
                              drag(e, (m) =>
                                set(
                                  "lanes",
                                  i(),
                                  "lfo",
                                  j,
                                  clamp(v0 + (y0 - m.clientY) / 150, 0, 1),
                                ),
                              );
                            }}
                            onDblClick={() =>
                              set("lanes", i(), "lfo", j, P.def)
                            }
                          >
                            <div class="dial" />
                            <span class="n">{P.name}</span>
                            <span class="v">{P.text(l.lfo![j])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Show>
                  <svg class="kf-line" width={X(FRAMES) + PADX} height={H}>
                    <polygon points={area(l)} />
                    <polyline points={line(l)} />
                  </svg>
                  <For each={l.keys}>
                    {(k) => (
                      <b
                        class="kf-key"
                        ref={(el) => {
                          createEffect(
                            () => (
                              k.t,
                              k.v,
                              z(),
                              width(),
                              sel(),
                              queueMicrotask(() => place(el))
                            ),
                          );
                        }}
                        onPointerEnter={(e) => place(e.currentTarget)}
                        classList={{ on: sel() === k.id }}
                        style={{ left: `${X(k.t)}px`, top: `${Y(k.v)}px` }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSel(k.id);
                          const [x0, y0, t0, v0] = [
                            e.clientX,
                            e.clientY,
                            k.t,
                            k.v,
                          ];
                          // knob-style: relative drag, up = higher value; x moves the frame
                          drag(e, (m) =>
                            set(
                              "lanes",
                              i(),
                              "keys",
                              (x) => x.id === k.id,
                              produce((x) => {
                                x.v = clamp(
                                  v0 + (y0 - m.clientY) / INNER,
                                  0,
                                  1,
                                );
                                x.t = clamp(
                                  Math.round(t0 + (m.clientX - x0) / z()),
                                  0,
                                  FRAMES,
                                );
                              }),
                            ),
                          );
                        }}
                      >
                        <span>
                          {k.t} · {k.v.toFixed(2)}
                        </span>
                      </b>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
          <Show when={!s.lanes.length}>
            <p class="kf-empty">No lanes — add one</p>
          </Show>

          <div class="kf-head" style={{ left: `${LABEL + X(head())}px` }} />
        </div>
      </div>
    </div>
  );
}
