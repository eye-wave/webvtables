import "./styles/theme.css";
import "./styles/shell.css";
import { createAudio } from "./audio/audio";
import { createContextMenu } from "./components/ctx/ctx";
import { createInput } from "./editor/input";
import { createPreview } from "./editor/preview";
import { createMenu } from "./components/menu/menu";
import { createHeightmap } from "./gfx/heightmap";
import { createOverlay } from "./gfx/overlay";
import { createRopes } from "./gfx/ropes";
import { createScene } from "./editor/scene";
import { createTransport } from "./components/transport/transport";
import { createView } from "./gfx/view";
import { loadWasm } from "./wasm";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { createKf } from "./editor/kf";
import { Keyframes } from "./components/keyframes/keyframes";
import { createSettings, fpsTick } from "./components/settings/settings";
import { createProject } from "./components/project/project";

declare const nodeGrid: HTMLDivElement;
declare const gridBg: HTMLDivElement;
declare const canvas: HTMLCanvasElement;
declare const heightmap: HTMLCanvasElement;
declare const kfHandle: HTMLDivElement;

const draw = createOverlay(canvas);
const drawMap = createHeightmap(heightmap);

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
  for (const ev of ["pointerdown", "dblclick", "contextmenu"])
    heightmap.addEventListener(ev, (e) => e.stopPropagation());
  heightmap.onclick = () => (drawMap.toggle(), schedule());

  scene.add(0, 40, 40);
  scene.add(1, 540, 100);

  let queued = false;
  let last = 0;
  const schedule = () =>
    queued || ((queued = true), requestAnimationFrame(frame));

  const kf = createKf(wasm);
  const preview = createPreview(wasm, scene, kf, drawMap);
  render(
    () =>
      Keyframes({
        host: {
          ...kf,
          nodes: scene.nodes,
          onChange: scene.onChange,
          schedule,
          head,
          setHead,
          denorm: wasm.param_denorm,
          norm: wasm.param_norm,
        },
      }),
    kfBox,
  );
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
    for (const [id, a, b] of scene.links()) ropes.pin(id, a, b);
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
