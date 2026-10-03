import { fineScale } from "./fine";
import { editParam } from "../components/param_edit/param_edit";
import type { Pt, Ropes } from "../gfx/ropes";
import type { Scene, Sock } from "./scene";
import type { ViewCtl } from "../gfx/view";
import knobCss from "../components/node/knob.module.css";
import nodeCss from "../components/node/node.module.css";

const PENDING = -1;
const HIT = 8;

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
  let lit: Pt[] = [];

  let hot: HTMLElement | null = null;
  const hover = (k: HTMLElement | null) => {
    if (k === hot) return;
    hot?.classList.remove(knobCss.on);
    k?.classList.add(knobCss.on);
    hot = k;
    schedule();
  };

  const dragKnob = (e: PointerEvent, k: ReturnType<Scene["knob"]>): Drag => {
    let y = e.clientY;
    return {
      move(e) {
        const dy = y - e.clientY;
        y = e.clientY;
        k.set(Math.min(1, Math.max(0, k.get() + (dy / 150) * fineScale(e))));
      },
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
    lit = scene.targets(from);
    return {
      move: pin,
      up(e) {
        lit = [];
        const el = (e.target as HTMLElement).closest<HTMLElement>(
          `.${nodeCss.socket}`,
        );
        const i = el ? scene.connect(from, scene.socket(el)) : -1;
        if (i < 0) ropes.drop(PENDING);
        else ropes.rename(PENDING, i);
      },
    };
  };

  const unlink = (i: number) => {
    const last = scene.unlink(i);
    if (last === i) ropes.drop(i);
    else ropes.rename(last, i);
    ropes.highlight(-1);
    grid.style.cursor = "";
  };

  grid.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const t = e.target as HTMLElement;
    const flag = t.closest<HTMLElement>(`.${nodeCss.flag}`);
    if (flag) return (scene.flag(flag), schedule());
    const knob = t.closest<HTMLElement>(`.${knobCss.knob}`);
    if (knob && e.ctrlKey) return editParam(knob, scene.param(knob, schedule));
    const sock = t.closest<HTMLElement>(`.${nodeCss.socket}`);
    const node = t.closest<HTMLElement>(`.${nodeCss.node}`);
    const link =
      knob || sock || node ? -1 : ropes.hit(view.world(e), HIT / view.v[2]);
    hover(knob);
    if (link >= 0) unlink(link);
    else
      drag = knob
        ? dragKnob(e, scene.knob(knob))
        : sock
          ? dragLink(e, scene.socket(sock))
          : node
            ? dragNode(e, node)
            : dragPan(e);
    schedule();
  });

  addEventListener("pointermove", (e) => {
    if (drag) return (drag.move(e), schedule());

    const t = e.target as HTMLElement;
    const id =
      grid.contains(t) && !t.closest(`.${nodeCss.node}`)
        ? ropes.hit(view.world(e), HIT / view.v[2])
        : -1;
    hover(grid.contains(t) ? t.closest<HTMLElement>(`.${knobCss.knob}`) : null);
    if (ropes.highlight(id)) schedule();
    grid.style.cursor = id < 0 ? "" : "pointer";
  });
  addEventListener("pointerup", (e) => {
    if (!drag) return;
    drag.up?.(e);
    drag = null;
    const target = e.target;
    hover(
      target instanceof Element
        ? target.closest<HTMLElement>(`.${knobCss.knob}`)
        : null,
    );

    schedule();
  });

  grid.addEventListener("dblclick", (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>(
      `.${knobCss.knob}`,
    );
    if (!k || e.ctrlKey) return;
    scene.resetKnob(k);
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

  return {
    get lit() {
      return lit;
    },
  };
}
