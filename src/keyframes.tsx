import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";
import type { Kf, LaneView } from "./kf";

const FINE = 0.05;
const FRAMES = 255,
  LABEL = 148,
  PADX = 10,
  H = 72,
  PADY = 10,
  RULER = 24,
  INNER = H - 2 * PADY;
const hue = (i: number) => `hsl(${(210 + i * 67) % 360} 85% 68%)`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const SHAPES = ["Sine", "Tri", "Saw", "Square"];
const LFO = [
  {
    name: "shape",
    def: 0,
    text: (v: number) => SHAPES[Math.min(3, Math.floor(v * 4))],
  },
  { name: "phase", def: 0, text: (v: number) => `${Math.round(v * 360)}°` },
  { name: "amp", def: 1, text: (v: number) => `${Math.round(v * 100)}%` },
  { name: "freq", def: 0.2, text: (v: number) => `${(32 ** v).toFixed(2)}×` },
  { name: "skew", def: 0.5, text: (v: number) => v.toFixed(2) },
  { name: "dc", def: 0.5, text: (v: number) => (v - 0.5).toFixed(2) },
] as const;

export type NodeInfo = {
  p: number;
  name: string;
  params: { addr: number; j: number; name: string }[];
};
export type Host = {
  nodes(): NodeInfo[];
  onChange(cb: () => void): void;
  schedule(): void;
  head(): number;
  setHead(frame: number): void;
} & Kf;

export function Keyframes(props: { host: Host }) {
  const host = props.host;
  const [s, set] = createStore<{ lanes: LaneView[] }>({ lanes: host.lanes() });
  const [nodes, setNodes] = createSignal(host.nodes());
  const [width, setWidth] = createSignal(0);
  const [mult, setMult] = createSignal(1);
  const [sel, setSel] = createSignal<[lane: number, key: number]>();
  const { head, setHead } = host;
  let scroll!: HTMLDivElement;

  const refresh = () => {
    set("lanes", reconcile(host.lanes()));
    host.schedule();
  };
  host.onChange(() => {
    setNodes(host.nodes());
    refresh();
  });
  createEffect(() => (head(), host.schedule()));

  onMount(() => {
    const ro = new ResizeObserver(() => setWidth(scroll.clientWidth));
    ro.observe(scroll);
    onCleanup(() => ro.disconnect());
  });

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

  const line = (l: LaneView) =>
    Array.from(l.curve, (v, i) => `${X(i / 2)},${Y(v)}`).join(" ");
  const area = (l: LaneView) =>
    l.curve.length ? `${X(0)},${H} ${line(l)} ${X(FRAMES)},${H}` : "";

  function Picker(props: { lane: number }) {
    const [open, setOpen] = createSignal(false);
    const [q, setQ] = createSignal("");
    const [pos, setPos] = createSignal<Record<string, string>>({});
    let btn!: HTMLButtonElement;
    let pop: HTMLDivElement | undefined;
    const lane = () => s.lanes[props.lane];
    const owner = (addr: number) =>
      s.lanes.findIndex((x) => x.addrs.includes(addr));

    const label = () => {
      const a = lane()?.addrs ?? [];
      const hit = nodes().flatMap((n) =>
        n.params
          .filter((p) => p.addr === a[0])
          .map((p) => `${n.name} · ${p.name}`),
      )[0];
      return a.length
        ? (hit ?? "…") + (a.length > 1 ? ` +${a.length - 1}` : "")
        : "no target";
    };

    const groups = () => {
      const needle = q().trim().toLowerCase();
      return nodes()
        .map((n) => ({
          n,
          ps: n.params.filter((p) =>
            `${n.name} ${p.name}`.toLowerCase().includes(needle),
          ),
        }))
        .filter((g) => g.ps.length);
    };

    const toggle = (n: NodeInfo, p: NodeInfo["params"][0]) => {
      const o = owner(p.addr);
      if (o === props.lane) host.link(o, n.p, p.j, false);
      else {
        if (o >= 0) host.link(o, n.p, p.j, false);
        host.link(props.lane, n.p, p.j, true);
      }
      refresh();
    };

    const show = () => {
      const r = btn.getBoundingClientRect();
      const below = innerHeight - r.bottom - 12;
      const up = below < 200 && r.top > below;
      setPos(
        up
          ? {
              bottom: `${innerHeight - r.top + 4}px`,
              "max-height": `${Math.min(340, r.top - 12)}px`,
            }
          : {
              top: `${r.bottom + 4}px`,
              "max-height": `${Math.min(340, below)}px`,
            },
      );
      setPos((p) => ({
        ...p,
        left: `${Math.min(r.left, innerWidth - 248)}px`,
      }));
      setQ("");
      setOpen(true);
    };

    createEffect(() => {
      if (!open()) return;
      const away = (e: Event) => {
        if (!pop?.contains(e.target as Node) && !btn.contains(e.target as Node))
          setOpen(false);
      };
      const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
      addEventListener("pointerdown", away, true);
      addEventListener("keydown", esc, true);
      onCleanup(() => {
        removeEventListener("pointerdown", away, true);
        removeEventListener("keydown", esc, true);
      });
    });

    return (
      <>
        <button
          ref={btn}
          class="kf-target"
          title="Node params this lane drives"
          onClick={() => (open() ? setOpen(false) : show())}
        >
          {label()}
        </button>
        <Show when={open()}>
          <Portal>
            <div class="kf-pop" ref={pop} style={pos()}>
              <input
                placeholder="Search params…"
                spellcheck={false}
                ref={(el) => queueMicrotask(() => el.focus())}
                value={q()}
                onInput={(e) => setQ(e.currentTarget.value)}
              />
              <div class="kf-pop-list">
                <For
                  each={groups()}
                  fallback={<p class="kf-pop-empty">No params</p>}
                >
                  {(g) => (
                    <>
                      <div class="kf-pop-node">{g.n.name}</div>
                      <For each={g.ps}>
                        {(p) => (
                          <div
                            class="kf-pop-row"
                            classList={{ on: owner(p.addr) === props.lane }}
                            onClick={() => toggle(g.n, p)}
                          >
                            <span class="tick">
                              {owner(p.addr) === props.lane ? "✓" : ""}
                            </span>
                            {p.name}
                            <Show
                              when={
                                owner(p.addr) >= 0 &&
                                owner(p.addr) !== props.lane
                              }
                            >
                              <em>{s.lanes[owner(p.addr)].name}</em>
                            </Show>
                          </div>
                        )}
                      </For>
                    </>
                  )}
                </For>
              </div>
            </div>
          </Portal>
        </Show>
      </>
    );
  }

  return (
    <div
      class="kf"
      tabindex="0"
      onKeyDown={(e) => {
        const k = sel();
        if (!k || e.target instanceof HTMLInputElement) return;
        if (e.key !== "Delete" && e.key !== "Backspace") return;
        host.removeKey(...k);
        setSel();
        refresh();
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
                  onClick={() => {
                    host.addLane(lfo);
                    refresh();
                  }}
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
                    onInput={(e) => (
                      host.rename(i(), e.currentTarget.value),
                      refresh()
                    )}
                  />
                  <Picker lane={i()} />
                  <button
                    title="Remove lane"
                    onClick={() => {
                      host.removeLane(i());
                      setSel();
                      refresh();
                    }}
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
                    const k = host.addKey(
                      i(),
                      frameAt(e, e.currentTarget),
                      clamp(1 - (y - PADY) / INNER, 0, 1),
                    );
                    if (k >= 0) setSel([i(), k]);
                    refresh();
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
                              let [y, v] = [e.clientY, l.lfo![j]];
                              drag(e, (m) => {
                                v = clamp(
                                  v +
                                    ((y - m.clientY) / 150) *
                                      (m.altKey ? FINE : 1),
                                  0,
                                  1,
                                );
                                y = m.clientY;
                                host.setLfo(i(), j, v);
                                refresh();
                              });
                            }}
                            onDblClick={() => (
                              host.setLfo(i(), j, P.def),
                              refresh()
                            )}
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
                    {(k, ki) => (
                      <b
                        class="kf-key"
                        classList={{
                          on: sel()?.[0] === i() && sel()?.[1] === ki(),
                        }}
                        style={{ left: `${X(k.t)}px`, top: `${Y(k.v)}px` }}
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
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSel([i(), ki()]);
                          let [x, y, t, v] = [e.clientX, e.clientY, k.t, k.v];

                          drag(e, (m) => {
                            const f = m.altKey ? FINE : 1;
                            t = clamp(
                              t + ((m.clientX - x) / z()) * f,
                              0,
                              FRAMES,
                            );
                            v = clamp(v + ((y - m.clientY) / INNER) * f, 0, 1);
                            [x, y] = [m.clientX, m.clientY];
                            host.setKey(i(), ki(), Math.round(t), v);
                            refresh();
                          });
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
            <p class="kf-empty">No lanes - add one</p>
          </Show>

          <div class="kf-head" style={{ left: `${LABEL + X(head())}px` }} />
        </div>
      </div>
    </div>
  );
}
