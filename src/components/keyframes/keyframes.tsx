import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import AudioLines from "lucide-solid/icons/audio-lines";
import Blend from "lucide-solid/icons/blend";
import Check from "lucide-solid/icons/check";
import Close from "lucide-solid/icons/x";
import { createStore, reconcile } from "solid-js/store";
import { fineScale, knobDrag, unlock } from "../../editor/fine";
import type { Kf, LaneView } from "../../editor/kf";
import { editParam } from "../param_edit/param_edit";
import { laneColors } from "../settings/settings";
import ctxCss from "../ctx/ctx.module.css";
import knobCss from "../node/knob.module.css";
import kfCss from "./keyframes.module.css";
import { FRAMES, H, LABEL, PADX, type Bar } from "./bar";

const PADY = 10,
  RULER = 24,
  INNER = H - 2 * PADY;
const ICONS = [
  () => <i />,
  () => <Blend class={kfCss.kfIcon} size={14} />, // crossfade
  () => <AudioLines class={kfCss.kfIcon} size={14} />, // spectral
];
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const SHAPES = ["Sine", "Tri", "Square", "Saw"]; // Basic shapes order
// to/from convert normalized <-> displayed value (what ctrl+click edits)
const shapeAt = (v: number) => Math.min(3, Math.floor(v * 4));
const LFO = [
  {
    name: "shape",
    def: 0,
    text: (v: number) => SHAPES[shapeAt(v)],
    to: shapeAt,
    from: (d: number) => (clamp(Math.round(d), 0, 3) + 0.5) / 4,
    o: SHAPES,
  },
  {
    name: "phase",
    def: 0,
    text: (v: number) => `${Math.round(v * 360)}°`,
    to: (v: number) => v * 360,
    from: (d: number) => d / 360,
  },
  {
    name: "amp",
    def: 0.75,
    text: (v: number) => `${Math.round((v * 4 - 2) * 100)}%`,
    to: (v: number) => (v * 4 - 2) * 100,
    from: (d: number) => (d / 100 + 2) / 4,
  },
  {
    name: "freq",
    def: 0.04,
    text: (v: number) => `${(v * 50).toFixed(2)}×`,
    to: (v: number) => v * 50,
    from: (d: number) => d / 50,
  },
  {
    name: "skew",
    def: 0.5,
    text: (v: number) => v.toFixed(2),
    to: (v: number) => v,
    from: (d: number) => d,
  },
  {
    name: "dc",
    def: 0.5,
    text: (v: number) => (v - 0.5).toFixed(2),
    to: (v: number) => v - 0.5,
    from: (d: number) => d + 0.5,
  },
] as {
  name: string;
  def: number;
  text(v: number): string;
  to(v: number): number;
  from(d: number): number;
  o?: readonly string[];
}[];

const TYPES = ["White", "Perlin", "Linear", "Smooth"];
// random lane: seed, freq, type, amp, phase, dc (the last three are the LFO's)
const RAND = [
  {
    name: "seed",
    def: 0,
    text: (v: number) => `${Math.round(v * 99999)}`,
    to: (v: number) => Math.round(v * 99999),
    from: (d: number) => clamp(Math.round(d), 0, 99999) / 99999,
  },
  {
    name: "freq", // points per lane
    def: 0.1,
    text: (v: number) => `${(v * 128).toFixed(1)}×`,
    to: (v: number) => v * 128,
    from: (d: number) => d / 128,
  },
  {
    name: "type",
    def: 0.375,
    text: (v: number) => TYPES[shapeAt(v)],
    to: shapeAt,
    from: (d: number) => (clamp(Math.round(d), 0, 3) + 0.5) / 4,
    o: TYPES,
  },
  LFO[2],
  LFO[1],
  LFO[5],
] as typeof LFO;

// same precision rule as the engine's param text
const fmt = (v: number) => {
  const a = Math.abs(v);
  return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 3 : 4);
};

export type NodeInfo = {
  p: number;
  n: number; // wasm node index
  name: string;
  params: {
    addr: number;
    j: number;
    name: string;
    o?: readonly string[];
    u?: string;
  }[];
};
export type Host = {
  bar: Bar;
  nodes(): NodeInfo[];
  onChange(cb: () => void): void;
  schedule(): void;
  head(): number;
  setHead(frame: number): void;
  denorm(n: number, j: number, v: number): number;
  norm(n: number, j: number, d: number): number;
} & Kf;

export function Keyframes(props: { host: Host }) {
  const host = props.host;
  const [s, set] = createStore<{ lanes: LaneView[] }>({ lanes: host.lanes() });
  const [nodes, setNodes] = createSignal(host.nodes());
  const { bar } = host;
  const [width, setWidth] = createSignal(bar.scroll.clientWidth);
  const [z, setZ] = createSignal(bar.z());
  bar.onLayout(() => (setWidth(bar.scroll.clientWidth), setZ(bar.z())));
  const [sel, setSel] = createSignal<[lane: number, key: number]>();
  const [menu, setMenu] = createSignal<{ x: number; y: number }>();
  const { head } = host;
  const { scroll, root } = bar;
  let pop: HTMLDivElement | undefined;

  const refresh = () => {
    set("lanes", reconcile(host.lanes()));
    host.schedule();
  };
  host.onChange(() => {
    setNodes(host.nodes());
    refresh();
  });
  createEffect(() => (head(), host.schedule()));

  const del = ([l, k]: [number, number]) => {
    host.removeKey(l, k);
    setSel();
    setMenu();
    refresh();
  };

  createEffect(() => {
    const k = sel();
    if (!k) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (
        (e.target as Element).closest("input,textarea,select,[contenteditable]")
      )
        return;
      e.preventDefault();
      del(k);
    };
    const away = (e: Event) => {
      const t = e.target as Node;
      if (!root.contains(t) && !pop?.contains(t)) setSel();
    };
    addEventListener("keydown", key);
    addEventListener("pointerdown", away, true);
    onCleanup(() => {
      removeEventListener("keydown", key);
      removeEventListener("pointerdown", away, true);
    });
  });

  createEffect(() => {
    if (!menu()) return;
    const away = (e: Event) => pop?.contains(e.target as Node) || setMenu();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu();
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
    onCleanup(() => {
      removeEventListener("pointerdown", away, true);
      removeEventListener("keydown", esc, true);
    });
  });

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
  // Adjacent key pairs by time: [index of the earlier key, earlier, later].
  const segments = (l: LaneView) => {
    const o = l.keys
      .map((k, i) => [i, k] as const)
      .sort((x, y) => x[1].t - y[1].t);
    return o
      .slice(1)
      .map(([, b], n) => [o[n][0], o[n][1], b] as const)
      .filter(([, a, b]) => b.t > a.t);
  };
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
          class={kfCss.kfTarget}
          title="Node params this lane drives"
          onClick={() => (open() ? setOpen(false) : show())}
        >
          {label()}
        </button>
        <Show when={open()}>
          <Portal ref={(el) => (el.style.display = "contents")}>
            <div class={kfCss.kfPop} ref={pop} style={pos()}>
              <input
                placeholder="Search params…"
                spellcheck={false}
                ref={(el) => queueMicrotask(() => el.focus())}
                value={q()}
                onInput={(e) => setQ(e.currentTarget.value)}
              />
              <div class={kfCss.kfPopList}>
                <For
                  each={groups()}
                  fallback={<p class={kfCss.kfPopEmpty}>No params</p>}
                >
                  {(g) => (
                    <>
                      <div class={kfCss.kfPopNode}>{g.n.name}</div>
                      <For each={g.ps}>
                        {(p) => (
                          <div
                            class={kfCss.kfPopRow}
                            classList={{
                              [kfCss.on]: owner(p.addr) === props.lane,
                            }}
                            onClick={() => toggle(g.n, p)}
                          >
                            <span class={kfCss.kfPopTick}>
                              <Show when={owner(p.addr) === props.lane}>
                                <Check size={10} />
                              </Show>
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

  createEffect(() => bar.empty(!s.lanes.length));

  return (
    <>
          <For each={s.lanes}>
            {(l, i) => {
              const col = () => laneColors(i(), !!l.mode);
              return (
                <div
                  class={`kf-row ${kfCss.kfLane}`}
                  classList={{
                    [kfCss.kfFadeLane]: l.mode === 1,
                    [kfCss.kfSpecLane]: l.mode === 2,
                  }}
                  style={{
                    "--c": col().c,
                    "--c2": col().c2,
                    "--sc": l.mode ? `url(#kfg${i()})` : undefined,
                  }}
                >
                  <div class={"kf-label"}>
                    {ICONS[l.mode ?? 0]()}
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
                      <Close size={14} />
                    </button>
                  </div>
                  <div
                    class={"kf-track"}
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
                      <div class={kfCss.kfLfo}>
                        <div class={kfCss.kfKnobs}>
                          {(l.rand ? RAND : LFO).map((P, j) => (
                            <div
                              class={kfCss.kfKnob}
                              style={{ "--v": l.lfo![j] }}
                              title={`${P.name} (double-click to reset)`}
                              onPointerDown={(e) => {
                                let v = l.lfo![j];
                                if (e.ctrlKey)
                                  return editParam(e.currentTarget, {
                                    options: P.o,
                                    value: P.o ? `${P.to(v)}` : fmt(P.to(v)),
                                    commit(s) {
                                      const n = parseFloat(s);
                                      if (isNaN(n)) return;
                                      host.setLfo(i(), j, clamp(P.from(n), 0, 1));
                                      refresh();
                                    },
                                  });
                                const d = knobDrag(e);
                                addEventListener("pointerup", unlock, {
                                  once: true,
                                });
                                drag(e, (m) => {
                                  v = clamp(v + d(m), 0, 1);
                                  host.setLfo(i(), j, v);
                                  refresh();
                                });
                              }}
                              onDblClick={() => (
                                host.setLfo(i(), j, P.def),
                                refresh()
                              )}
                            >
                              <div class={`${knobCss.dial} ${kfCss.kfDial}`} />
                              <span class={kfCss.n}>{P.name}</span>
                              <span class={kfCss.v}>{P.text(l.lfo![j])}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Show>
                    <svg
                      class={kfCss.kfLine}
                      width={X(FRAMES) + PADX}
                      height={H}
                    >
                      <Show when={l.mode}>
                        <linearGradient
                          id={`kfg${i()}`}
                          gradientUnits="userSpaceOnUse"
                          x1="0"
                          x2={X(FRAMES) + PADX}
                        >
                          <stop offset="0" stop-color={col().c} />
                          <stop offset="1" stop-color={col().c2} />
                        </linearGradient>
                      </Show>
                      <polygon points={area(l)} />
                      <polyline points={line(l)} />
                    </svg>
                    <For each={segments(l)}>
                      {([ki, a, b]) => (
                        <i
                          class={kfCss.kfMid}
                          classList={{
                            [kfCss.kfFade]: l.mode === 1,
                            [kfCss.kfSpec]: l.mode === 2,
                          }}
                          title="Curve (double-click to reset)"
                          style={{
                            left: `${X((a.t + b.t) / 2)}px`,
                            top: `${Y(a.v + (b.v - a.v) * a.c)}px`,
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.button || a.v === b.v) return;
                            const top =
                              e.currentTarget.parentElement!.getBoundingClientRect()
                                .top;
                            drag(e, (m) => {
                              const v = clamp(
                                1 - (m.clientY - top - PADY) / INNER,
                                0,
                                1,
                              );
                              host.setCurve(
                                i(),
                                ki,
                                clamp((v - a.v) / (b.v - a.v), 0.02, 0.98),
                              );
                              refresh();
                            });
                          }}
                          onDblClick={(e) => (
                            e.stopPropagation(),
                            host.setCurve(i(), ki, 0.5),
                            refresh()
                          )}
                        />
                      )}
                    </For>
                    <For each={l.keys}>
                      {(k, ki) => (
                        <b
                          class={kfCss.kfKey}
                          classList={{
                            [kfCss.on]:
                              sel()?.[0] === i() && sel()?.[1] === ki(),
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
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSel([i(), ki()]);
                            setMenu({ x: e.clientX, y: e.clientY });
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.button) return;
                            setSel([i(), ki()]);
                            if (e.ctrlKey) {
                              const t = k.t;
                              const set = (v: number) => {
                                host.setKey(i(), ki(), t, clamp(v, 0, 1));
                                refresh();
                              };
                              // one entry per target that resolves to a param
                              const ts = nodes().flatMap((n) =>
                                n.params
                                  .filter((p) => l.addrs.includes(p.addr))
                                  .map((p) => ({ n, p })),
                              );
                              const views = ts.map(({ n, p }) => {
                                const d = host.denorm(n.n, p.j, k.v);
                                return {
                                  label: `${n.name} · ${p.name}`,
                                  options: p.o,
                                  value: p.o ? `${Math.round(d)}` : fmt(d),
                                  commit(s: string) {
                                    const x = parseFloat(s);
                                    if (!isNaN(x)) set(host.norm(n.n, p.j, x));
                                  },
                                };
                              });
                              const normed = {
                                label: "norm",
                                value: k.v.toFixed(4),
                                commit(s: string) {
                                  const x = parseFloat(s);
                                  if (!isNaN(x)) set(x);
                                },
                              };
                              return editParam(
                                e.currentTarget,
                                views.length === 1
                                  ? views[0]
                                  : views.length
                                    ? { ...views[0], alts: [...views, normed] }
                                    : normed,
                              );
                            }
                            let [x, y, t, v] = [e.clientX, e.clientY, k.t, k.v];

                            drag(e, (m) => {
                              const f = fineScale(m);
                              t = clamp(
                                t + ((m.clientX - x) / z()) * f,
                                0,
                                FRAMES,
                              );
                              v = clamp(
                                v + ((y - m.clientY) / INNER) * f,
                                0,
                                1,
                              );
                              [x, y] = [m.clientX, m.clientY];
                              host.setKey(i(), ki(), Math.round(t), v);
                              refresh();
                            });
                          }}
                        >
                          <span>
                            {k.t} · {k.v.toFixed(4)}
                          </span>
                        </b>
                      )}
                    </For>
                  </div>
                </div>
              );
            }}
          </For>
          <Show when={menu()}>
            {(m) => (
              <Portal ref={(el) => (el.style.display = "contents")}>
                <div
                  class={`${ctxCss.ctx} ${ctxCss.open}`}
                  ref={pop}
                  style={{
                    left: `${Math.min(m().x, innerWidth - 180)}px`,
                    top: `${Math.min(m().y, innerHeight - 48)}px`,
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <div
                    class={`${ctxCss.item} ${ctxCss.danger}`}
                    style={{ "--i": 0 }}
                    onClick={() => sel() && del(sel()!)}
                  >
                    Delete keyframe
                  </div>
                </div>
              </Portal>
            )}
          </Show>

    </>
  );
}
