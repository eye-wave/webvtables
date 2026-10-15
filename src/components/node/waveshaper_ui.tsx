import { createSignal, Index, onCleanup, onMount } from "solid-js";
import { clamp, createPoints, plotAt, type Grab } from "../points/points";
import kfCss from "../keyframes/keyframes.module.css";
import { decodePoints, encodePoints, ptsBoot, registerData, store, type Pt } from "./data_asset";
import { Flags, Head, Knobs, Scope, useNode, useParam } from "./node";
import css from "./waveshaper_ui.module.css";

// The transfer curve: points the user places, joined by straight lines, in the same units the
// engine reads them (see graph/node/waveshaper.rs). The points always fill the plot as -1..1; unipolar
// only relabels the axes as 0..1 (the engine remaps the points and mirrors them for negative input).
const LINE: Pt[] = [
  [-1, -1],
  [1, 1],
];

export function WaveshaperView() {
  const ctx = useNode();
  const polarity = useParam(0);
  const bi = () => polarity.value() < 0.5;
  const lo = () => (bi() ? -1 : 0); // axis label at the plot's low edge
  const disp = (v: number) => (bi() ? v : (v + 1) / 2); // stored -> shown
  const store_ = (v: number) => (bi() ? v : 2 * v - 1); // shown -> stored

  const boot = ptsBoot.get(ctx.i); // set when a project is loaded
  ptsBoot.delete(ctx.i);
  const [data, setData] = createSignal<Pt[]>(boot ?? LINE);
  let area!: HTMLDivElement;

  // The editor keeps the points in the order they were made; the engine sorts them.
  const put = (next: Pt[]) => {
    if (!store(ctx.wasm, +ctx.el!.dataset.n!, encodePoints(next))) return false;
    setData(next);
    ctx.redraw();
    return true;
  };
  onMount(() => put(data()) || put(LINE)); // too many points in a file: start over
  onCleanup(
    registerData(
      () => ctx.el,
      () => ({
        bytes: new Uint8Array(encodePoints(data()).buffer),
        spec: {},
      }),
    ),
  );

  const move = (i: number, x: number, y: number) =>
    put(data().map((p, j): Pt => (j === i ? [x, y] : p)));

  const ed = createPoints({
    del: ([, i]) => put(data().filter((_, j) => j !== i)),
    inside: (t) => area.contains(t),
  });

  const grab = (i: number): Grab => {
    const r = area.getBoundingClientRect();
    const [x, y] = data()[i];
    const field = (label: string, v: number, set: (n: number) => void) => ({
      label,
      value: disp(v).toFixed(4),
      commit(s: string) {
        const n = parseFloat(s);
        if (!isNaN(n)) set(clamp(store_(n), -1, 1));
      },
    });
    return {
      at: [x, y],
      per: [2 / r.width, -2 / r.height],
      min: [-1, -1],
      max: [1, 1],
      move: (x, y) => move(i, x, y),
      edit: () => {
        const fx = field("x", x, (n) => move(i, n, data()[i][1]));
        return { ...fx, alts: [fx, field("y", y, (n) => move(i, data()[i][0], n))] };
      },
    };
  };

  // stored units (y up) -> 0..1 of the area
  const at = (v: number) => (v + 1) / 2;
  const ticks = () => (bi() ? [-1, 0, 1] : [0, 0.5, 1]);
  const grid = [-0.5, 0, 0.5];
  const curve = () => {
    const s = data().length ? [...data()].sort((a, b) => a[0] - b[0]) : LINE;
    return [[-1, s[0][1]], ...s, [1, s[s.length - 1][1]]]
      .map(([x, y]) => `${x},${-y}`) // svg's y points down
      .join(" ");
  };

  return (
    <>
      <Head />
      <Knobs />
      <div class={css.plot} on:pointerdown={(e) => e.stopPropagation()}>
        <div
          ref={area}
          class={css.area}
          on:dblclick={(e) =>
            ed.add(e, () => {
              const r = area.getBoundingClientRect();
              const [fx, fy] = plotAt(e, area, [0, 0], [r.width, r.height]);
              const next = [...data(), [fx * 2 - 1, fy * 2 - 1] as Pt];
              return put(next) ? [0, next.length - 1] : undefined;
            })
          }
        >
          <div class={css.clip}>
            <svg viewBox="-1 -1 2 2" preserveAspectRatio="none">
              {grid.map((v) => (
                <>
                  <line
                    class={css.grid}
                    classList={{ [css.axis]: bi() && v === 0 }}
                    x1={v}
                    x2={v}
                    y1={-1}
                    y2={1}
                  />
                  <line
                    class={css.grid}
                    classList={{ [css.axis]: bi() && v === 0 }}
                    x1={-1}
                    x2={1}
                    y1={-v}
                    y2={-v}
                  />
                </>
              ))}
              <polyline class={css.curve} points={curve()} />
            </svg>
          </div>
          {ticks().map((v) => (
            <>
              <span
                class={`${css.tick} ${css.tx}`}
                style={{ left: `${((v - lo()) / (1 - lo())) * 100}%` }}
              >
                {v}
              </span>
              <span
                class={`${css.tick} ${css.ty}`}
                style={{ top: `${(1 - (v - lo()) / (1 - lo())) * 100}%` }}
              >
                {v}
              </span>
            </>
          ))}
          <Index each={data()}>
            {(p, i) => (
              <b
                class={`${kfCss.kfKey} ${css.pt}`}
                classList={{ [kfCss.on]: ed.isSel(0, i) }}
                style={{
                  left: `${at(p()[0]) * 100}%`,
                  top: `${(1 - at(p()[1])) * 100}%`,
                }}
                {...ed.point(
                  () => [0, i],
                  () => grab(i),
                )}
              />
            )}
          </Index>
        </div>
      </div>
      <ed.Menu />
      <Flags />
      <Scope w={0} style={{ flex: "none", height: "56px", "box-sizing": "border-box" }} />
    </>
  );
}
