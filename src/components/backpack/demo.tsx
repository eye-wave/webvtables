// <Demo> for the guides: real node UI, running on real wasm, inside the dialog.
//
// The demo nodes are added to the main graph as unlinked orphans, parked OFF px away from any view, and
// removed again when the guide closes. Their DOM lives in the dialog (a second scene over the same wasm),
// shifted back by OFF; the main scene never mounts them, so it can't touch them.
// The node DOM, knobs and scopes are the editor's own (createScene/mountNode); the wave lines and
// the straight socket links are drawn on one small 2D canvas over them. No linking or moving: the
// links are fixed, only knobs and flags respond.
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { nodes } from "../../generated/nodes";
import { createScene, type Scene } from "../../editor/scene";
import { knobDrag, unlock } from "../../editor/fine";
import { unmountNode, type ParamInfo } from "../node/node";
import { main, type WasmExports } from "../../wasm";
import knobCss from "../node/knob.module.css";
import nodeCss from "../node/node.module.css";
import css from "./demo.module.css";

export type DemoProps = {
  /** [node name or id, { parameter name: option name, or a value in the units the knob shows }] */
  nodes: [name: string, params?: Record<string, number | string>][];
  /** [from, to, from's output socket = 0, to's input socket = 0], by index into `nodes`. Default: a chain. */
  links?: [from: number, to: number, out?: number, into?: number][];
};

const GAP_X = 56,
  GAP_Y = 16,
  PAD = 16,
  OFF = 1e6,
  LINK = "rgb(199, 209, 230)";

const rgb = (c: readonly number[]) =>
  `rgb(${c.map((v) => Math.round(v * 255))})`;

// Columns by link depth, each centred vertically. Returns the stage size.
function place(
  wasm: WasmExports,
  base: number,
  scene: Scene,
  els: HTMLElement[],
  links: number[][],
) {
  const f = new Float32Array(wasm.memory.buffer);
  const size = els.map((_, i) => {
    const p = wasm.get_node(base + i) >> 2;
    return [f[p + 2], f[p + 3]];
  });
  const depth = els.map(() => 0);
  for (let pass = 0; pass < els.length; pass++)
    for (const [a, b] of links) depth[b] = Math.max(depth[b], depth[a] + 1);

  const cols = [...new Set(depth)]
    .sort((a, b) => a - b)
    .map((d) => els.map((_, i) => i).filter((i) => depth[i] === d));
  const heights = cols.map(
    (c) => c.reduce((s, i) => s + size[i][1], 0) + (c.length - 1) * GAP_Y,
  );
  const tall = Math.max(...heights);
  let x = PAD;
  cols.forEach((c, k) => {
    let y = PAD + (tall - heights[k]) / 2;
    for (const i of c) {
      scene.move(els[i], OFF + x, OFF + y);
      y += size[i][1] + GAP_Y;
    }
    x += Math.max(...c.map((i) => size[i][0])) + GAP_X;
  });
  return [x - GAP_X + PAD, tall + 2 * PAD];
}

// Demos on one page share the tail of the graph; it is cut only when the last one goes (indices shift).
let live = 0,
  origin = 0;

function start(host: HTMLElement, props: DemoProps): () => void {
  const wasm = main;
  if (!live++) origin = wasm.nodes_len();
  const base = wasm.nodes_len();
  const release = () => {
    if (!--live)
      while (wasm.nodes_len() > origin) wasm.remove_node(wasm.nodes_len() - 1);
  };
  const stage = host.appendChild(
    Object.assign(document.createElement("div"), { className: css.stage }),
  );
  const world = stage.appendChild(
    Object.assign(document.createElement("div"), { className: css.world }),
  );
  world.style.cssText = `left:${-OFF}px;top:${-OFF}px`;
  const canvas = stage.appendChild(
    Object.assign(document.createElement("canvas"), { className: css.canvas }),
  );
  const ctx = canvas.getContext("2d")!;
  let raf = 0,
    dead = false;
  const schedule = () => (raf ||= requestAnimationFrame(frame));
  const scene = createScene(wasm, world, schedule);

  const kinds = props.nodes.map(([name]) => {
    const k = nodes.findIndex((n) => n.name === name || n.id === name);
    if (k < 0) throw new Error(`no node called "${name}"`);
    return k;
  });
  const els = props.nodes.map(([, params], i) => {
    scene.add(kinds[i], OFF, OFF);
    const info = nodes[kinds[i]].params as readonly ParamInfo[];
    for (const [name, v] of Object.entries(params ?? {})) {
      const j = info.findIndex((p) => p.n === name);
      if (j < 0)
        throw new Error(`${nodes[kinds[i]].name} has no parameter "${name}"`);
      const d = typeof v === "string" ? (info[j].o?.indexOf(v) ?? -1) : v;
      wasm.param_set_denorm(base + i, j, d);
    }
    return world.lastElementChild as HTMLElement;
  });

  const wires = (props.links ?? els.slice(1).map((_, i) => [i, i + 1])).map(
    ([a, b, so = 0, si = 0]) => {
      const from = { node: base + a, out: true, j: so },
        to = { node: base + b, out: false, j: si };
      if (scene.connect(from, to) < 0)
        throw new Error(
          `can't link ${props.nodes[a]?.[0]} to ${props.nodes[b]?.[0]}`,
        );
      return [from, to] as const;
    },
  );

  const [w, h] = place(
    wasm,
    base,
    scene,
    els,
    wires.map(([a, b]) => [a.node - base, b.node - base]),
  );
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  // fixed wiring: nothing here can be grabbed or dragged
  for (const el of els) el.style.cursor = "default";
  stage
    .querySelectorAll<HTMLElement>(`.${nodeCss.socket}`)
    .forEach((s) => (s.style.pointerEvents = "none"));

  function frame() {
    raf = 0;
    if (dead) return;
    const dpr = devicePixelRatio;
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    wasm.scope_begin();
    scene.sync(new Set());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(-OFF, -OFF); // socketPos and scope rects are in graph coordinates

    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = LINK;
    ctx.lineWidth = 2.5;
    for (const [a, b] of wires) {
      const [ax, ay] = scene.socketPos(a),
        [bx, by] = scene.socketPos(b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // same mapping as the editor's wave shader: 2px inset, -1..1 top to bottom
    const m = 2;
    ctx.lineWidth = 1.4;
    for (const {
      rect: [x, y, sw, sh],
      pts,
      color,
    } of scene.scopes()) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, sw, sh);
      ctx.clip();

      ctx.strokeStyle = rgb(color);
      ctx.beginPath();
      pts.forEach((v, i) => {
        const px = x + m + ((sw - 2 * m) * i) / (pts.length - 1);
        const py =
          y + m + (sh - 2 * m) * (0.5 - 0.5 * Math.max(-1, Math.min(1, v)));
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.stroke();

      ctx.strokeStyle = "rgb(255, 0, 0)";
      for (let i = 1; i < pts.length; i++) {
        const v0 = pts[i - 1];
        const v1 = pts[i];
        if ((v0 > 1 && v1 > 1) || (v0 < -1 && v1 < -1)) {
          const px0 = x + m + ((sw - 2 * m) * (i - 1)) / (pts.length - 1);
          const py0 =
            y + m + (sh - 2 * m) * (0.5 - 0.5 * Math.max(-1, Math.min(1, v0)));
          const px1 = x + m + ((sw - 2 * m) * i) / (pts.length - 1);
          const py1 =
            y + m + (sh - 2 * m) * (0.5 - 0.5 * Math.max(-1, Math.min(1, v1)));
          ctx.beginPath();
          ctx.moveTo(px0, py0);
          ctx.lineTo(px1, py1);
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  // knobs and flags, the way the grid handles them
  let hot: HTMLElement | null = null;
  const knobOf = (e: Event) =>
    (e.target as Element).closest<HTMLElement>(`.${knobCss.knob}`);
  stage.onpointerover = (e) => {
    const k = knobOf(e);
    if (k === hot) return;
    hot?.classList.remove(knobCss.on);
    k?.classList.add(knobCss.on);
    hot = k;
  };
  stage.onpointerdown = (e) => {
    if (e.button) return;
    const flag = (e.target as Element).closest<HTMLElement>(`.${nodeCss.flag}`);
    if (flag) return (scene.flag(flag), schedule());
    const knob = knobOf(e);
    if (!knob) return;
    const k = scene.knob(knob),
      d = knobDrag(e);
    const move = (m: PointerEvent) => {
      k.set(Math.min(1, Math.max(0, k.get() + d(m))));
      schedule();
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      unlock();
      schedule();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  stage.ondblclick = (e) => {
    const k = knobOf(e);
    if (k) (scene.resetKnob(k), schedule());
  };

  schedule();
  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    unlock();
    els.forEach(unmountNode);
    host.replaceChildren();
    release();
  };
}

export default function Demo(props: DemoProps) {
  let host!: HTMLDivElement;
  const [error, setError] = createSignal("");
  let stop: (() => void) | undefined;
  onMount(() => {
    try {
      stop = start(host, props);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });
  onCleanup(() => stop?.());
  return (
    <>
      <div class={css.demo} ref={host} />
      <Show when={error()}>
        <p class={css.error}>Demo error: {error()}</p>
      </Show>
    </>
  );
}
