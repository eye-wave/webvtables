import "./styles/theme.css";
import "./styles/shell.css";
import { createAudio } from "./audio/audio";
import { createContextMenu } from "./components/ctx/ctx";
import { createInput } from "./editor/input";
import { createPreview } from "./editor/preview";
import { createMenu } from "./components/menu/menu";
import { createHeightmap, mapRect } from "./gfx/heightmap";
import { createOverlay } from "./gfx/overlay";
import { createRopes } from "./gfx/ropes";
import { createScene } from "./editor/scene";
import { createTransport } from "./components/transport/transport";
import { createView } from "./gfx/view";
import { loadWasm } from "./wasm";
import { createEffect, createSignal } from "solid-js";
import { render } from "solid-js/web";
import type { Kf, LazyKf } from "./editor/kf";
import { createBar } from "./components/keyframes/bar";
import { createSettings, fpsTick } from "./components/settings/settings";
import { createProject } from "./components/project/project";

declare const nodeGrid: HTMLDivElement;
declare const gridBg: HTMLDivElement;
declare const canvas: HTMLCanvasElement;
declare const kfHandle: HTMLDivElement;
declare const narrow: HTMLDivElement;

window.onload = () => (narrow.hidden = false);

const draw = createOverlay(canvas);
const drawMap = createHeightmap(canvas);

const kfBox = document.querySelector<HTMLElement>(".box-keyframes")!;
kfHandle.onpointerdown = (e) => {
  const y0 = e.clientY,
    h0 = kfBox.offsetHeight;
  kfHandle.setPointerCapture(e.pointerId);
  kfHandle.onpointermove = (m) => {
    const h = h0 + y0 - m.clientY;
    kfBox.style.height = `${Math.min(innerHeight * 0.7, Math.max(80, h))}px`;
  };
  kfHandle.onpointerup = () => (kfHandle.onpointermove = null);
};

loadWasm().then((wasm) => {
  const scene = createScene(wasm, nodeGrid, () => schedule());
  const view = createView(nodeGrid, gridBg);
  const ropes = createRopes(wasm);
  const audio = createAudio();

  const transport = createTransport(
    document.querySelector<HTMLElement>(".box-playback")!,
    audio,
    () => schedule(),
  );
  const [head, setHead] = createSignal(0);

  // Click the map to flip flat <-> 3D; keep the grid underneath from seeing it.
  // The map is drawn into the overlay canvas, so hit-test its static rect.
  const box = canvas.parentElement!;
  const onMap = (e: MouseEvent) => {
    const r = box.getBoundingClientRect();
    const [x, y, w, h] = mapRect(r.width, r.height);
    const [px, py] = [e.clientX - r.left - x, e.clientY - r.top - y];
    return px >= 0 && py >= 0 && px < w && py < h;
  };
  for (const ev of ["pointerdown", "dblclick", "contextmenu"])
    box.addEventListener(
      ev,
      (e) => onMap(e as MouseEvent) && e.stopPropagation(),
      true,
    );
  box.addEventListener(
    "click",
    (e) => onMap(e) && (drawMap.toggle(), schedule()),
  );

  scene.add(0, 40, 40);
  scene.add(1, 540, 100);

  let queued = false;
  let last = 0;
  const schedule = () =>
    queued || ((queued = true), requestAnimationFrame(frame));

  // The ruler/+New shell is plain DOM; the lane editor behind it loads on the first lane.
  const bar = createBar({
    setHead,
    addLane: async (lfo, mode) => {
      (await kf.load()).addLane(lfo, mode);
      scene.notify();
    },
  });
  createEffect(() => bar.setHead(head()));

  // Keyframe logic + UI load on the first lane (new or from a project file).
  let real: Kf | undefined, booting: Promise<Kf> | undefined;
  const kf: LazyKf = {
    lanes: () => real?.lanes() ?? [],
    apply: (f) => real?.apply(f) ?? new Set<number>(),
    load: () =>
      (booting ??= (async () => {
        const [{ createKf }, { Keyframes }] = await Promise.all([
          import("./editor/kf"),
          import("./components/keyframes/keyframes"),
        ]);
        const k = (real = createKf(wasm));
        render(
          () =>
            Keyframes({
              host: {
                ...k,
                bar,
                nodes: scene.nodes,
                onChange: scene.onChange,
                schedule,
                head,
                setHead,
                denorm: wasm.param_denorm,
                norm: wasm.param_norm,
              },
            }),
          bar.mount,
        );
        return k;
      })()),
  };
  const preview = createPreview(wasm, scene, kf, drawMap);
  createProject(
    document.querySelector<HTMLElement>(".box-playback")!,
    wasm,
    scene,
    kf,
    head,
    schedule,
  );

  createSettings(document.querySelector<HTMLElement>(".box-playback")!, wasm);

  function frame(t: number) {
    queued = false;
    fpsTick();
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;

    if (transport.playing) setHead((h) => (h + dt * transport.speed) % 256);
    view.apply();
    const filling = preview.step();
    wasm.scope_begin();
    const driven = kf.apply(head());
    const inst = scene.sync(driven);
    for (const [id, a, b] of scene.links())
      a && b ? ropes.pin(id, a, b) : ropes.drop(id);
    const table = scene.outputTable();
    audio.table(table);
    const moving = ropes.step(Math.min(dt, 0.05));

    draw({
      nodes: inst,
      view: view.v,
      segs: ropes.segments(),
      scopes: scene.scopes(),
      rings: input.lit,
      t: t / 1000,
    });
    drawMap.draw(head(), table);
    if (moving || input.lit.length || transport.playing || filling) schedule();
  }

  const input = createInput(canvas.parentElement!, {
    scene,
    view,
    ropes,
    schedule,
  });
  const add = createMenu(canvas.parentElement!, view, scene, schedule);
  createContextMenu(canvas.parentElement!, {
    scene,
    view,
    schedule,
    kf,
    head,
    openAdd: add.open,
  });
  new ResizeObserver(schedule).observe(nodeGrid);
  schedule();
});
