import Pencil from "lucide-solid/icons/pencil";
import Reset from "lucide-solid/icons/rotate-ccw";
import Spline from "lucide-solid/icons/spline";
import { createSignal, onCleanup, onMount } from "solid-js";
import { clamp, drag, plotAt } from "../points/points";
import { DRAW_POINTS as P, drawBoot, registerData, store } from "./data_asset";
import { Flags, Head, Knobs, Scope, useNode, useParam } from "./node";
import css from "./waveshaper_ui.module.css";

// P pre-allocated gains on a log-frequency axis; dragging paints values, Shift erases.
// The engine displays input and filtered spectra behind the curve.
const BEND = 2.3; // Matches draw_filter.rs
const bin = (b: number) => (b - 1) / 1022; // Normalize bins to 0..1
const at = (b: number, lin: boolean) =>
  lin ? bin(b) : Math.log(1 + bin(b) * (Math.exp(BEND) - 1)) / BEND;

export function DrawFilterView() {
  const ctx = useNode();
  const boot = drawBoot.get(ctx.i);
  drawBoot.delete(ctx.i);
  const [data, setData] = createSignal(boot ?? new Float32Array(P));
  const scale = useParam(1);
  const useAxis = useParam(2);
  const lin = () => useAxis.value() > 0.5;
  const X = () => (lin() ? [1, 256, 512, 768, 1023] : [1, 10, 100, 1000]);
  const [smooth, setSmooth] = createSignal(false);
  let area!: HTMLDivElement;

  const [spec, setSpec] = createSignal(new Float32Array(2 * P));
  const poll = () => {
    const { wasm } = ctx;
    const len = wasm.scope_fill(+ctx.el!.dataset.n!, 1);
    if (len === 2 * P)
      setSpec(
        new Float32Array(wasm.memory.buffer, wasm.scope_ptr(), len).slice(),
      );
  };
  ctx.polls.add(poll);
  onCleanup(() => ctx.polls.delete(poll));
  const area_ = (o: number) =>
    `-1,1 ${Array.from({ length: P }, (_, i) => `${(i / (P - 1)) * 2 - 1},${1 - 2 * spec()[o + i]}`).join(" ")} 1,1`;

  const put = (next: Float32Array) => {
    if (!store(ctx.wasm, +ctx.el!.dataset.n!, next)) return;
    setData(next);
    ctx.redraw();
  };
  onMount(() => put(data()));
  onCleanup(
    registerData(
      () => ctx.el,
      () => ({ bytes: new Uint8Array(data().buffer.slice(0)), spec: {} }),
    ),
  );

  const pos = (e: PointerEvent) => {
    const r = area.getBoundingClientRect();
    const [fx, fy] = plotAt(e, area, [0, 0], [r.width, r.height]);
    return [Math.round(fx * (P - 1)), fy * 2 - 1] as const;
  };

  const pencil = (e: PointerEvent) => {
    let last: readonly [number, number] | undefined;
    drag(e, (m) => {
      const [i, y0] = pos(m);
      const y = m.shiftKey ? 0 : y0;
      const [j, z] = last ?? [i, y];
      const old = data();
      const next = old.slice();
      const n = Math.abs(i - j);
      if (smooth()) {
        for (
          let k = Math.max(0, Math.min(i, j) - 2);
          k <= Math.min(P - 1, Math.max(i, j) + 2);
          k++
        ) {
          const w = old.subarray(Math.max(0, k - 2), k + 3);
          next[k] = w.reduce((a, b) => a + b) / w.length;
        }
      } else
        for (let k = 0; k <= n; k++)
          next[n ? j + ((i - j) * k) / n : i] = clamp(
            z + ((y - z) * k) / (n || 1),
            -1,
            1,
          );
      last = [i, y];
      put(next);
    });
  };

  const curve = () =>
    Array.from(data(), (y, i) => `${(i / (P - 1)) * 2 - 1},${-y}`).join(" ");

  return (
    <>
      <Head />
      <Knobs />
      <div class={css.tools} on:pointerdown={(e) => e.stopPropagation()}>
        <button
          title="Pencil"
          classList={{ [css.on]: !smooth() }}
          on:click={() => setSmooth(false)}
        >
          <Pencil size={12} />
        </button>
        <button
          title="Smooth"
          classList={{ [css.on]: smooth() }}
          on:click={() => setSmooth(true)}
        >
          <Spline size={12} />
        </button>
        <button title="Flatten" on:click={() => put(new Float32Array(P))}>
          <Reset size={12} />
        </button>
      </div>
      <div class={css.plot} on:pointerdown={(e) => e.stopPropagation()}>
        <div ref={area} class={css.area} on:pointerdown={pencil}>
          <div class={css.clip}>
            <svg viewBox="-1 -1 2 2" preserveAspectRatio="none">
              {[-0.5, 0, 0.5].map((v) => (
                <line
                  class={css.grid}
                  classList={{ [css.axis]: v === 0 }}
                  x1={-1}
                  x2={1}
                  y1={-v}
                  y2={-v}
                />
              ))}
              {X().map((b) => (
                <line
                  class={css.grid}
                  x1={at(b, lin()) * 2 - 1}
                  x2={at(b, lin()) * 2 - 1}
                  y1={-1}
                  y2={1}
                />
              ))}
              <polygon class={css.specIn} points={area_(0)} />
              <polygon class={css.specOut} points={area_(P)} />
              <polyline class={css.curve} points={curve()} />
            </svg>
          </div>
          {X().map((b) => (
            <span
              class={`${css.tick} ${css.tx}`}
              style={{ left: `${at(b, lin()) * 100}%` }}
            >
              {b}
            </span>
          ))}
          {[1, 0, -1]
            .map((v) => v * Math.round(scale.value()))
            .map((v) => (
              <span
                class={`${css.tick} ${css.ty}`}
                style={{
                  top: `${(0.5 - v / (2 * Math.round(scale.value()))) * 100}%`,
                }}
              >
                {v}
              </span>
            ))}
        </div>
      </div>
      <Flags />
      <Scope
        w={0}
        style={{ flex: "none", height: "56px", "box-sizing": "border-box" }}
      />
    </>
  );
}
