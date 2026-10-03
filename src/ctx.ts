import type { Kf } from "./kf";
import type { Scene } from "./scene";
import type { ViewCtl } from "./view";

type Item = { label: string; run(): void; danger?: boolean } | "-";

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
  const root = document.createElement("div");
  root.className = "ctx";
  document.body.append(root);

  const close = () => {
    root.classList.remove("open");
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
      kf.rename(lane, knob.querySelector(".pname")!.textContent!);
      take(lane);
    };
    return [
      ...lanes.map((l, i): Item => ({
        label: `${i === owner ? "✓ " : ""}Lane: ${l.name}`,
        run: () => (i === owner ? (kf.link(i, p, j, false), done()) : take(i)),
      })),
      { label: "New points lane", run: fresh(false) },
      { label: "New LFO lane", run: fresh(true) },
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

  grid.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    root.classList.remove("open");
    root.replaceChildren();
    let i = 0;
    for (const it of itemsFor(e)) {
      if (it === "-") {
        root.append(document.createElement("hr"));
        continue;
      }
      const el = document.createElement("div");
      el.className = it.danger ? "item danger" : "item";
      el.textContent = it.label;
      el.style.setProperty("--i", `${i++}`);
      el.addEventListener("click", () => {
        close();
        it.run();
        schedule();
      });
      root.append(el);
    }

    const { offsetWidth: w, offsetHeight: h } = root;
    const flipX = e.clientX + w > innerWidth - 8,
      flipY = e.clientY + h > innerHeight - 8;
    root.style.left = `${Math.max(0, flipX ? e.clientX - w : e.clientX)}px`;
    root.style.top = `${Math.max(0, flipY ? e.clientY - h : e.clientY)}px`;
    root.style.transformOrigin = `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`;

    void root.offsetWidth;
    root.classList.add("open");
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
  });
  root.addEventListener("contextmenu", (e) => e.preventDefault());
}
