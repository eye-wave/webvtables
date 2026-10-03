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
import { render as mount } from "solid-js/web";
import { Keyframes } from "./keyframes";

declare const nodeGrid: HTMLDivElement;
declare const gridBg: HTMLDivElement;
declare const canvas: HTMLCanvasElement;
declare const kfHandle: HTMLDivElement;

const draw = createOverlay(canvas);

const kf = document.querySelector<HTMLElement>(".box-keyframes")!;
mount(Keyframes, kf);
kfHandle.onpointerdown = (e) => {
  const y0 = e.clientY,
    h0 = kf.offsetHeight;
  kfHandle.setPointerCapture(e.pointerId);
  kfHandle.onpointermove = (m) => {
    const h = h0 + y0 - m.clientY;
    kf.style.height = `${Math.min(innerHeight * 0.7, Math.max(80, h))}px`;
  };
  kfHandle.onpointerup = () => (kfHandle.onpointermove = null);
};

loadWasm().then((wasm) => {
  const scene = createScene(wasm, nodeGrid);
  const view = createView(nodeGrid, gridBg);
  const ropes = createRopes(wasm);
  const audio = createAudio();

  createTransport(document.querySelector<HTMLElement>(".box-playback")!, audio);

  scene.add(0, 40, 40);
  scene.add(1, 540, 100);

  let queued = false;
  let last = 0;
  const schedule = () =>
    queued || ((queued = true), requestAnimationFrame(frame));

  function frame(t: number) {
    queued = false;
    view.apply();
    wasm.scope_begin();
    const inst = scene.sync();
    for (const [id, a, b] of scene.links()) ropes.pin(id, a, b);
    audio.table(scene.outputTable());
    const moving = ropes.step(Math.min((t - last) / 1000, 0.05));
    last = t;

    draw({
      nodes: inst,
      view: view.v,
      segs: ropes.segments(),
      scopes: scene.scopes(),
      rings: input.lit,
      t: t / 1000,
    });
    if (moving || input.lit.length) schedule();
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
    openAdd: add.open,
  });
  new ResizeObserver(schedule).observe(nodeGrid);
  schedule();
});
