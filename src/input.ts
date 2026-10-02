import type { Ropes } from "./ropes";
import type { Scene, Sock } from "./scene";
import type { ViewCtl } from "./view";

const PENDING = -1;

type Drag = { move(e: PointerEvent): void; up?(e: PointerEvent): void };

export function createInput(
  grid: HTMLElement,
  {
    scene,
    view,
    ropes,
    schedule,
  }: { scene: Scene; view: ViewCtl; ropes: Ropes; schedule: () => void },
) {
  let drag: Drag | null = null;

  const dragKnob = (e: PointerEvent, k: ReturnType<Scene["knob"]>): Drag => {
    const y0 = e.clientY,
      v0 = k.get();
    return {
      move: (e) => k.set(Math.min(1, Math.max(0, v0 + (y0 - e.clientY) / 150))),
    };
  };

  const dragNode = (e: PointerEvent, el: HTMLElement): Drag => {
    const [wx, wy] = view.world(e),
      [x, y] = scene.pos(el);
    const dx = wx - x,
      dy = wy - y;
    scene.raise(el);
    return {
      move(e) {
        const [x, y] = view.world(e);
        scene.move(el, x - dx, y - dy);
      },
    };
  };

  const dragPan = (e: PointerEvent): Drag => {
    let px = e.clientX,
      py = e.clientY;
    return {
      move(e) {
        view.pan(e.clientX - px, e.clientY - py);
        px = e.clientX;
        py = e.clientY;
      },
    };
  };

  const dragLink = (e: PointerEvent, from: Sock): Drag => {
    const anchor = scene.socketPos(from);
    const pin = (e: PointerEvent) => {
      const w = view.world(e);
      const [a, b] = from.out ? [anchor, w] : [w, anchor];
      ropes.pin(PENDING, a, b);
    };
    pin(e);
    return {
      move: pin,
      up(e) {
        const el = (e.target as HTMLElement).closest<HTMLElement>(".socket");
        const i = el ? scene.connect(from, scene.socket(el)) : -1;
        if (i < 0) ropes.drop(PENDING);
        else ropes.rename(PENDING, i);
      },
    };
  };

  grid.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    const knob = t.closest<HTMLElement>(".knob");
    const sock = t.closest<HTMLElement>(".socket");
    const node = t.closest<HTMLElement>(".node");
    drag = knob
      ? dragKnob(e, scene.knob(knob))
      : sock
        ? dragLink(e, scene.socket(sock))
        : node
          ? dragNode(e, node)
          : dragPan(e);
    schedule();
  });

  addEventListener("pointermove", (e) => drag && (drag.move(e), schedule()));
  addEventListener("pointerup", (e) => {
    if (!drag) return;
    drag.up?.(e);
    drag = null;
    schedule();
  });

  grid.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      view.zoom(e);
      schedule();
    },
    { passive: false },
  );
}
