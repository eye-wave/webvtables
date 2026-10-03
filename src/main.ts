import "./style.css";
import { createAudio } from "./audio";
import { createContextMenu } from "./ctx";
import { createInput } from "./input";
import { createMenu } from "./menu";
import { createOverlay } from "./overlay";
import { createRopes } from "./ropes";
import { createScene } from "./scene";
import { createTransport } from "./transport";
import { createView } from "./view";
import { loadWasm } from "./wasm";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { createKf } from "./kf";
import { Keyframes } from "./keyframes";
import { createProject } from "./project";

declare const nodeGrid: HTMLDivElement;
declare const gridBg: HTMLDivElement;
declare const canvas: HTMLCanvasElement;
declare const kfHandle: HTMLDivElement;

const draw = createOverlay(canvas);

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
  const scene = createScene(wasm, nodeGrid);
  const view = createView(nodeGrid, gridBg);
  const ropes = createRopes(wasm);
  const audio = createAudio();

  const transport = createTransport(
    document.querySelector<HTMLElement>(".box-playback")!,
    audio,
    () => schedule(),
  );
  const [head, setHead] = createSignal(0);

  scene.add(0, 40, 40);
  scene.add(1, 540, 100);

  let queued = false;
  let last = 0;
  const schedule = () =>
    queued || ((queued = true), requestAnimationFrame(frame));

  const kf = createKf(wasm);
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

  function frame(t: number) {
    queued = false;
    const dt = Math.min((t - last) / 1000, 0.1);
    last = t;

    if (transport.playing) setHead((h) => (h + dt * transport.speed) % 256);
    view.apply();
    wasm.scope_begin();
    const driven = kf.apply(head());
    const inst = scene.sync(driven);
    for (const [id, a, b] of scene.links()) ropes.pin(id, a, b);
    audio.table(scene.outputTable());
    const moving = ropes.step(Math.min(dt, 0.05));

    draw({
      nodes: inst,
      view: view.v,
      segs: ropes.segments(),
      scopes: scene.scopes(),
      rings: input.lit,
      t: t / 1000,
    });
    if (moving || input.lit.length || transport.playing) schedule();
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
    openAdd: add.open,
  });
  new ResizeObserver(schedule).observe(nodeGrid);
  schedule();
});
