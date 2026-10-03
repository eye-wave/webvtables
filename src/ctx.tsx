import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { nodes } from "./generated/nodes";
import { editParam } from "./param_edit";
import type { Kf } from "./kf";
import type { Scene } from "./scene";
import type { ViewCtl } from "./view";

type Item =
  | { label: string; run(): void; danger?: boolean }
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
  }: {
    kf: Kf;
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
    const knob = (e.target as HTMLElement).closest<HTMLElement>(".knob");
    if (!knob) return [];
    const [p, j, addr] = [+node.dataset.p!, +knob.dataset.j!, +knob.dataset.a!];
    const lanes = kf.lanes();
    const owner = lanes.findIndex((l) => l.addrs.includes(addr));
    const done = () => scene.notify();
    const take = (lane: number) => {
      if (owner >= 0) kf.link(owner, p, j, false);
      kf.link(lane, p, j, true);
      done();
    };
    const fresh = (lfo: boolean) => () => {
      const lane = kf.addLane(lfo);
      if (lane < 0) return;
      kf.rename(lane, nodes[+node.dataset.k!].params[j].name);
      take(lane);
    };
    return [
      {
        label: "Enter value…",
        run: () => editParam(knob, scene.param(knob, schedule)),
      },
      { label: "New points lane", run: fresh(false) },
      { label: "New LFO lane", run: fresh(true) },
      ...(lanes.length
        ? [
            {
              label: "Add to existing",
              sub: lanes.map((l, i): Item => ({
                label: `${i === owner ? "✓ " : ""}${l.name}`,
                run: () =>
                  i === owner ? (kf.link(i, p, j, false), done()) : take(i),
              })),
            } satisfies Item,
          ]
        : []),
      "-",
    ];
  };

  const itemsFor = (e: MouseEvent): Item[] => {
    const node = (e.target as HTMLElement).closest<HTMLElement>(".node");
    if (!node)
      return [
        { label: "Add node…", run: () => openAdd(e) },
        {
          label: "Reset view",
          run() {
            view.v[0] = view.v[1] = 0;
            view.v[2] = 1;
          },
        },
      ];
    return [
      ...paramItems(e, node),
      { label: "Duplicate", run: () => scene.duplicate(node) },
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
          <div class="item has-sub" style={p.top ? { "--i": i() } : {}}>
            {it.label}
            <div class="sub">
              <Items items={it.sub} />
            </div>
          </div>
        ) : (
          <div
            class={it.danger ? "item danger" : "item"}
            style={p.top ? { "--i": i() } : {}}
            onClick={() => {
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
        class="ctx"
        ref={root}
        classList={{ open: open(), flip: at().flip }}
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
    if (e.ctrlKey && (e.target as HTMLElement).closest(".knob")) return;
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
