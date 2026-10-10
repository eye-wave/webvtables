// Wires the keyframe panel markup in index.html (ruler, "+ New", playhead, zoom). Works before
// the lane editor (keyframes.tsx, Solid) has loaded; that mounts into #kfLanes.
import ctxCss from "../ctx/ctx.module.css";

declare const kfRoot: HTMLElement;
declare const kfScroll: HTMLElement;
declare const kfInner: HTMLElement;
declare const kfTrack: HTMLElement;
declare const kfNew: HTMLButtonElement;
declare const kfLanes: HTMLElement;
declare const kfEmpty: HTMLElement;
declare const kfHead: HTMLElement;

export const FRAMES = 255,
  LABEL = 148,
  PADX = 10,
  H = 72;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export type Bar = ReturnType<typeof createBar>;

export function createBar(o: {
  setHead(frame: number): void;
  addLane(kind: number, mode: number): void;
}) {
  const ticks = [...kfTrack.querySelectorAll<HTMLElement>("[data-f]")];
  let mult = 1,
    frame = 0;
  const subs: (() => void)[] = [];
  const z = () =>
    (Math.max(kfScroll.clientWidth - LABEL - 2 * PADX - 1, FRAMES) / FRAMES) * mult;
  const headAt = () => (kfHead.style.left = `${LABEL + PADX + frame * z()}px`);

  const layout = () => {
    const zz = z();
    kfScroll.style.cssText = `--z:${zz}px;--x0:${PADX}px;--label:${LABEL}px;--h:${H}px`;
    kfInner.style.width = `${LABEL + 2 * PADX + FRAMES * zz}px`;
    for (const t of ticks) t.style.left = `${PADX + +t.dataset.f! * zz}px`;
    headAt();
    subs.forEach((f) => f());
  };
  new ResizeObserver(layout).observe(kfScroll);

  kfRoot.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    mult = clamp(mult * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 16);
    layout();
  });

  const at = (m: MouseEvent) =>
    clamp(Math.round((m.clientX - kfTrack.getBoundingClientRect().left - PADX) / z()), 0, FRAMES);
  kfTrack.onpointerdown = (e) => {
    kfTrack.setPointerCapture(e.pointerId);
    kfTrack.onpointermove = (m) => o.setHead(at(m));
    kfTrack.onpointerup = () => (kfTrack.onpointermove = kfTrack.onpointerup = null);
    o.setHead(at(e));
  };

  // "+ New" popup, built on demand
  let menu: HTMLElement | undefined;
  const close = () => {
    menu?.remove();
    menu = undefined;
    removeEventListener("pointerdown", away, true);
    removeEventListener("keydown", esc, true);
  };
  const away = (e: Event) => menu?.contains(e.target as Node) || close();
  const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
  kfNew.onpointerdown = (e) => e.stopPropagation();
  kfNew.onclick = () => {
    if (menu) return close();
    const r = kfNew.getBoundingClientRect();
    menu = Object.assign(document.createElement("div"), {
      className: `${ctxCss.ctx} ${ctxCss.open}`,
      oncontextmenu: (e: Event) => e.preventDefault(),
    });
    Object.assign(menu.style, { left: `${r.left}px`, top: `${r.bottom + 2}px` });
    (
      [
        ["Points lane", 0, 0],
        ["LFO lane", 1, 0],
        ["Random lane", 2, 0],
        ["Crossfade lane", 0, 1],
        ["Spectral lane", 0, 2],
      ] as const
    ).forEach(([text, kind, mode], n) => {
      const it = Object.assign(document.createElement("div"), {
        className: `${ctxCss.item} ${ctxCss.add}`,
        textContent: text,
        onclick: () => (close(), o.addLane(kind, mode)),
      });
      it.style.setProperty("--i", `${n}`);
      menu!.append(it);
    });
    document.body.append(menu);
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
  };

  layout();
  return {
    root: kfRoot,
    scroll: kfScroll,
    mount: kfLanes,
    z,
    onLayout: (f: () => void) => subs.push(f),
    setHead(f: number) {
      frame = f;
      headAt();
    },
    empty: (on: boolean) => (kfEmpty.hidden = !on),
  };
}
