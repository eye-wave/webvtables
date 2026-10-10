import { knobDrag, unlock } from "./fine";
import { editParam } from "../components/param_edit/param_edit";
import type { Pt, Ropes } from "../gfx/ropes";
import type { Group, Scene, Sock } from "./scene";
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
    const d = knobDrag(e);
    return {
      move: (e) => k.set(Math.min(1, Math.max(0, k.get() + d(e)))),
      up: unlock,
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

  // Moves every member; a collapsed group sits at its members' top-left, so it follows.
  const dragGroup = (e: PointerEvent, g: Group): Drag => {
    const [wx, wy] = view.world(e);
    const from = g.members.map((m) => scene.pos(m));
    g.members.forEach((m) => scene.raise(m));
    return {
      move(e) {
        const [x, y] = view.world(e);
        g.members.forEach((m, i) =>
          scene.move(m, from[i][0] + x - wx, from[i][1] + y - wy),
        );
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
        // Touch pointers stay captured by the origin socket, so e.target is
        // useless here: hit-test at the pointer, accept anywhere on a node.
        const el = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>(`.${nodeCss.node}`);
        const to = el && scene.nearest(from, +el.dataset.n!, view.world(e));
        const i = to ? scene.connect(from, to) : -1;
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

  // Pinch: touches are tracked in the capture phase, so fingers landing on node widgets (which
  // stop pointerdown for themselves) still count. The second finger cancels whatever the first
  // started and takes over; no other handler sees it.
  type Touch = { pt: Pt; target: Element };
  const touches = new Map<number, Touch>();
  let pinch: { ids: [number, number]; s: [number, number, number]; a: Pt; b: Pt } | null = null;
  const cancelDrag = () => {
    if (drag) ropes.drop(PENDING);
    drag = null;
    lit = [];
    unlock();
  };
  const pair = (): [Pt, Pt] | null => {
    const p = pinch && touches.get(pinch.ids[0]),
      q = pinch && touches.get(pinch.ids[1]);
    return p && q ? [p.pt, q.pt] : null;
  };
  grid.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { pt: [e.clientX, e.clientY], target: e.target as Element });
      if (touches.size < 2) return;
      e.stopPropagation();
      if (pinch) return;
      const [[i, p], [j, q]] = [...touches];
      cancelDrag();
      for (const [id, t] of touches) // free the fingers from any widget that captured them
        try {
          t.target.releasePointerCapture(id);
        } catch {}
      pinch = { ids: [i, j], s: [...view.v], a: p.pt, b: q.pt };
    },
    true,
  );
  const lift = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (pinch?.ids.includes(e.pointerId)) pinch = null;
  };
  addEventListener("pointercancel", lift);

  grid.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const t = e.target as HTMLElement;
    const grp = scene.groupAt(t);
    if (grp && t.closest("input, button")) return; // the name box and view button handle themselves
    const flag = t.closest<HTMLElement>(`.${nodeCss.flag}`);
    if (flag) return (scene.flag(flag), schedule());
    const knob = t.closest<HTMLElement>(`.${knobCss.knob}`);
    if (knob && e.ctrlKey) return editParam(knob, scene.param(knob, schedule));
    const sock = t.closest<HTMLElement>(`.${nodeCss.socket}`);
    const node = t.closest<HTMLElement>(`.${nodeCss.node}`);
    if (e.shiftKey && node && !knob && !sock)
      return (scene.select(node), schedule());
    const link =
      knob || sock || node || grp
        ? -1
        : ropes.hit(view.world(e), HIT / view.v[2]);
    hover(knob);
    if (link >= 0) unlink(link);
    else {
      if (!node && !grp && !knob && !sock) scene.deselect();
      drag = knob
        ? dragKnob(e, scene.knob(knob))
        : sock
          ? dragLink(e, scene.socket(sock))
          : node
            ? dragNode(e, node)
            : grp
              ? dragGroup(e, grp)
              : dragPan(e);
    }
    schedule();
  });

  addEventListener("pointermove", (e) => {
    const tp = touches.get(e.pointerId);
    if (tp) tp.pt = [e.clientX, e.clientY];
    if (pinch) {
      const now = pair();
      if (now) view.pinch(pinch.s, pinch.a, pinch.b, ...now);
      return schedule();
    }
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
    lift(e);
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
