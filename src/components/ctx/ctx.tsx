import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { nodes } from "../../generated/nodes";
import { editParam } from "../param_edit/param_edit";
import type { Kf, LazyKf } from "../../editor/kf";
import type { Group, Mode, Scene } from "../../editor/scene";
import type { ViewCtl } from "../../gfx/view";
import knobCss from "../node/knob.module.css";
import nodeCss from "../node/node.module.css";
import ctxCss from "./ctx.module.css";

type Item =
  | { label: string; run(): void; danger?: boolean; add?: boolean; key?: boolean; off?: string }
  | { label: string; sub: Item[] }
  | "-";

const SUB_W = 180;

export function createContextMenu(
  grid: HTMLElement,
  {
    scene,
    view,
    schedule,
    openAdd,
    kf,
    head,
  }: {
    kf: LazyKf;
    head: () => number;
    scene: Scene;
    view: ViewCtl;
    schedule: () => void;
    openAdd: (e: MouseEvent) => void;
  },
) {
  let root!: HTMLDivElement;
  const [items, setItems] = createSignal<Item[]>([]);
  const [open, setOpen] = createSignal(false);
  const [at, setAt] = createSignal({
    left: 0,
    top: 0,
    origin: "",
    flip: false,
  });

  const close = () => {
    setOpen(false);
    removeEventListener("pointerdown", away, true);
    removeEventListener("keydown", esc, true);
  };
  const away = (e: Event) => {
    if (!root.contains(e.target as Node)) close();
  };
  const esc = (e: KeyboardEvent) => e.key === "Escape" && close();

  const paramItems = (e: MouseEvent, node: HTMLElement): Item[] => {
    const knob = (e.target as HTMLElement).closest<HTMLElement>(`.${knobCss.knob}`);
    if (!knob) return [];
    const [p, j, addr] = [+node.dataset.p!, +knob.dataset.j!, +knob.dataset.a!];
    const lanes = kf.lanes();
    const owner = lanes.findIndex((l) => l.addrs.includes(addr));
    const done = () => scene.notify();
    const take = (k: Kf, lane: number) => {
      if (owner >= 0) k.link(owner, p, j, false);
      k.link(lane, p, j, true);
      done();
    };
    const fresh = (lfo: boolean, mode = 0) => async () => {
      const k = await kf.load();
      const lane = k.addLane(lfo, mode);
      if (lane < 0) return;
      k.rename(lane, nodes[+node.dataset.k!].params[j].n);
      take(k, lane);
    };
    // A node may have only one spectral-blended param (mirrors Keyframes::spectral_ok in Rust).
    const mine = new Set(
      [...node.querySelectorAll<HTMLElement>("[data-a]")].map((n) => +n.dataset.a!),
    );
    const busy = lanes.some(
      (l) => l.mode === 2 && l.addrs.some((a) => a !== addr && mine.has(a)),
    );
    const off = busy
      ? "This node already has a spectral lane on another parameter. Only one spectral lane per node is allowed - remove it first."
      : undefined;
    const frame = Math.round(head());
    const lane = lanes[owner];
    const addKey = () => {
      if (lane?.lfo || lane?.keys.some((k) => k.t === frame)) return [];
      return [
        {
          label: `Add keyframe at ${frame}`,
          key: true,
          async run() {
            const k = await kf.load();
            let l = owner;
            if (l < 0) {
              l = k.addLane(false);
              if (l < 0) return;
              k.rename(l, nodes[+node.dataset.k!].params[j].n);
            }
            const v = scene.knob(knob).get();
            if (l !== owner) take(k, l);
            k.addKey(l, frame, v);
            done();
          },
        } satisfies Item,
      ];
    };
    return [
      {
        label: "Enter value…",
        run: () => editParam(knob, scene.param(knob, schedule)),
      },
      ...addKey(),
      { label: "New points lane", add: true, run: fresh(false) },
      { label: "New LFO lane", add: true, run: fresh(true) },
      { label: "New crossfade lane", add: true, run: fresh(false, 1) },
      { label: "New spectral lane", add: true, run: fresh(false, 2), off },
      ...(lanes.length
        ? [
            {
              label: "Add to existing",
              sub: lanes.map((l, i): Item => ({
                label: `${i === owner ? "✓ " : ""}${l.name}`,
                off: l.mode === 2 && i !== owner ? off : undefined,
                run: async () => {
                  const k = await kf.load();
                  i === owner ? (k.link(i, p, j, false), done()) : take(k, i);
                },
              })),
            } satisfies Item,
          ]
        : []),
      "-",
    ];
  };

  const VIEWS = ["Expanded", "Parameters", "Name only"];
  const groupItems = (g: Group): Item[] => [
    { label: "Duplicate group", run: () => scene.duplicateGroup(g) },
    {
      label: "View",
      sub: VIEWS.map((label, m) => ({
        label: `${g.mode === m ? "✓ " : ""}${label}`,
        run: () => scene.setMode(g, m as Mode),
      })),
    },
    { label: "Ungroup", run: () => scene.ungroup(g) },
    "-",
    {
      label: "Delete group and its nodes",
      run: () => [...g.members].forEach((m) => scene.remove(m)),
      danger: true,
    },
  ];

  // Shift+click also selects; this is the discoverable route.
  const pickItems = (node?: HTMLElement): Item[] => {
    const sel = scene.picked();
    return [
      ...(node
        ? [
            {
              label: sel.includes(node) ? "Deselect" : "Select",
              run: () => scene.select(node),
            },
          ]
        : []),
      ...(sel.length
        ? [
            {
              label: `Group selected (${sel.length})`,
              run: () => void scene.group(),
              off: sel.some((n) => scene.groupOf(n))
                ? "Some selected nodes are already in a group."
                : undefined,
            },
            { label: "Clear selection", run: () => scene.deselect() },
          ]
        : []),
    ];
  };

  const itemsFor = (e: MouseEvent): Item[] => {
    const t = e.target as HTMLElement;
    const g = scene.groupAt(t);
    if (g) {
      // a param-list knob belongs to a node hidden inside the group
      const knob = t.closest<HTMLElement>(`.${knobCss.knob}`);
      return [
        ...(knob ? paramItems(e, scene.owner(knob)) : []),
        ...groupItems(g),
      ];
    }
    const node = t.closest<HTMLElement>(`.${nodeCss.node}`);
    if (!node)
      return [
        { label: "Add node…", run: () => openAdd(e) },
        ...pickItems(),
        {
          label: "Reset view",
          run() {
            view.v[0] = view.v[1] = 0;
            view.v[2] = 1;
          },
        },
      ];
    const own = scene.groupOf(node);
    return [
      ...paramItems(e, node),
      ...pickItems(node),
      ...(own ? [{ label: "Ungroup", run: () => scene.ungroup(own) }] : []),
      { label: "Duplicate", run: () => void scene.duplicate(node) },
      { label: "Reset parameters", run: () => scene.reset(node) },
      "-",
      { label: "Delete", run: () => scene.remove(node), danger: true },
    ];
  };

  const Items = (p: { items: Item[]; top?: boolean }) => (
    <For each={p.items}>
      {(it, i) =>
        it === "-" ? (
          <hr />
        ) : "sub" in it ? (
          <div class={`${ctxCss.item} ${ctxCss.hasSub}`} style={p.top ? { "--i": i() } : {}}>
            {it.label}
            <div class={ctxCss.sub}>
              <Items items={it.sub} />
            </div>
          </div>
        ) : (
          <div
            class={
              it.off
                ? `${ctxCss.item} ${ctxCss.off}`
                : it.danger
                ? `${ctxCss.item} ${ctxCss.danger}`
                : it.key
                  ? `${ctxCss.item} ${ctxCss.addKey}`
                  : it.add
                    ? `${ctxCss.item} ${ctxCss.add}`
                    : ctxCss.item
            }
            style={p.top ? { "--i": i() } : {}}
            title={it.off}
            onClick={() => {
              if (it.off) return;
              close();
              it.run();
              schedule();
            }}
          >
            {it.label}
          </div>
        )
      }
    </For>
  );

  render(
    () => (
      <div
        class={ctxCss.ctx}
        ref={root}
        classList={{ [ctxCss.open]: open(), [ctxCss.flip]: at().flip }}
        style={{
          left: `${at().left}px`,
          top: `${at().top}px`,
          "transform-origin": at().origin,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Items items={items()} top />
      </div>
    ),
    document.body,
  );

  grid.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (e.ctrlKey && (e.target as HTMLElement).closest(`.${knobCss.knob}`)) return;
    setOpen(false);
    setItems(itemsFor(e));
    const { offsetWidth: w, offsetHeight: h } = root;
    const flipX = e.clientX + w > innerWidth - 8,
      flipY = e.clientY + h > innerHeight - 8;
    setAt({
      left: Math.max(0, flipX ? e.clientX - w : e.clientX),
      top: Math.max(0, flipY ? e.clientY - h : e.clientY),
      origin: `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`,
      flip: flipX || e.clientX + w + SUB_W > innerWidth,
    });
    void root.offsetWidth;
    setOpen(true);
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
  });
}
