import { nodes as kinds } from "../../generated/nodes";
import type { Kf, LazyKf } from "../../editor/kf";
import type { DefSpec, EndSpec, InstSpec, Restore, Scene } from "../../editor/scene";
import type { WasmExports } from "../../wasm";
import {
  decode,
  decodeDraw,
  decodePoints,
  drawBoot,
  pending,
  ptsBoot,
  savedAt,
  type Asset,
} from "../node/data_asset";
import { texBoot, texOf } from "../node/math";
import type { Node as PNode, Project } from "./file";

const fileLib = () => import("./file");
import projectCss from "./project.module.css";

const button = (text: string, title: string, onclick: () => void) =>
  Object.assign(document.createElement("button"), {
    className: projectCss.tool,
    textContent: text,
    title,
    onclick,
  });

const download = (name: string, data: BlobPart, type: string) => {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([data], { type })),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

declare const fileDialog: HTMLDialogElement;
declare const fileClose: HTMLButtonElement;
declare const fileName: HTMLInputElement;
declare const fileSave: HTMLButtonElement;
declare const fileExport: HTMLButtonElement;
declare const fileExportForm: HTMLFormElement;
declare const fileQuality: HTMLSelectElement;
declare const fileInterp: HTMLSelectElement;
declare const fileInfo: HTMLElement;
declare const fileDrop: HTMLDivElement;
declare const fileBrowse: HTMLButtonElement;
declare const fileInput: HTMLInputElement;
declare const fileMsg: HTMLParagraphElement;

export function createProject(
  root: HTMLElement,
  wasm: WasmExports,
  scene: Scene,
  kf: LazyKf,
  head: () => number,
  loaded: () => void,
) {
  type Pick = "save" | "import" | "export";
  const rows: Record<Pick, HTMLElement> = {
    save: fileSave.parentElement!,
    import: fileDrop,
    export: fileExportForm,
  };
  const focus: Record<Pick, HTMLElement> = {
    save: fileSave,
    import: fileBrowse,
    export: fileQuality,
  };

  // The inline display:none keeps the markup inert; lift it only while open.
  const open = (pick: Pick) => {
    fileMsg.textContent = "";
    fileDialog.style.display = "";
    if (!fileDialog.open) fileDialog.showModal();
    for (const k in rows) rows[k as Pick].toggleAttribute("data-pick", k === pick);
    focus[pick].focus();
  };
  fileDialog.onclose = () => (fileDialog.style.display = "none");
  fileClose.onclick = () => fileDialog.close();
  fileDialog.onclick = (e) => e.target === fileDialog && fileDialog.close();

  const f32 = () => new Float32Array(wasm.memory.buffer);
  const FLAGS_AT = 17; // byte offset of Node.flags (see scene.ts)

  // Live state -> model. Node ids exist only in the file, so they are made up here.
  const snapshot = ({ newIds }: typeof import("./file")): Project => {
    const info = scene.snapshot();
    const n = wasm.nodes_len();
    const ids = newIds(n + info.insts.length); // node index -> id; then one per instance
    const instId = (k: number) => ids[n + k];
    const aids = newIds(n, 20); // spare ids; only nodes holding data use one
    const at = new Map<number, { id: string; j: number }>();
    const p: Project = {
      nodes: [],
      links: [],
      lanes: [],
      defs: [],
      assets: [],
    };
    // Node i as the file has it. Only main nodes can be keyframed or hold data (a definition's can't).
    const nodeOf = (i: number, id: string, main: boolean): PNode => {
      const [x, y] = f32().subarray(wasm.get_node(i) >> 2, (wasm.get_node(i) >> 2) + 2);
      const params: number[] = [];
      for (let j = 0, a; (a = wasm.get_param(i, j)) >= 0; j++) {
        params.push(f32()[a >> 2]);
        if (main) at.set(a, { id, j });
      }
      const flags = new Uint8Array(wasm.memory.buffer)[wasm.get_node(i) + FLAGS_AT];
      const d = main ? savedAt(i) : undefined; // the original import and its settings, not the rendered frames
      // Math nodes: the LaTeX is the asset, a plain text file
      const tex = main ? texOf(wasm.get_node(i)) : undefined;
      if (d) p.assets.push({ id: aids[i], data: d.bytes });
      else if (tex !== undefined)
        p.assets.push({ id: aids[i], data: new TextEncoder().encode(tex) });
      return {
        id,
        kind: kinds[wasm.node_kind(i)].id,
        params,
        x,
        y,
        flags,
        asset: d || tex !== undefined ? aids[i] : undefined,
        spec: d?.spec,
      };
    };
    for (let i = 0; i < n; i++) if (info.space.get(i) === "") p.nodes.push(nodeOf(i, ids[i], true));
    info.insts.forEach((g, k) =>
      p.nodes.push({
        id: instId(k),
        kind: "&" + g.def.slice(2),
        params: g.vals,
        x: g.x,
        y: g.y,
        flags: g.flags,
      }),
    );
    const local = new Map<number, string>(); // definition node index -> its local id
    for (const d of info.defs) {
      const lids = newIds(d.nodes.length, 16);
      d.nodes.forEach((i, k) => local.set(i, lids[k]));
    }
    const inside = new Map<string, Project["links"]>();
    const u8 = new Uint8Array(wasm.memory.buffer),
      u16 = new Uint16Array(wasm.memory.buffer);
    for (let i = 0; i < wasm.links_len(); i++) {
      const l = wasm.get_link(i);
      const [a, sa, b, sb] = [u16[l >> 1], u8[l + 2], u16[(l >> 1) + 2], u8[l + 6]];
      const [pa, pb] = [info.port.get(a), info.port.get(b)];
      const [ka, kb] = [info.space.get(a), info.space.get(b)];
      if ((ka === "i" && !pa) || (kb === "i" && !pb)) continue; // inside an instance
      if (pa && pb && pa.inst === pb.inst) continue;
      if ((pa || ka === "") && (pb || kb === ""))
        p.links.push([
          pa ? instId(pa.inst) : ids[a],
          pa ? pa.port : sa,
          pb ? instId(pb.inst) : ids[b],
          pb ? pb.port : sb,
        ]);
      else if (ka && ka === kb) {
        const list = inside.get(ka) ?? [];
        inside.set(ka, list);
        list.push([local.get(a)!, sa, local.get(b)!, sb]);
      }
    }
    p.defs = info.defs.map((d) => ({
      id: d.id,
      name: d.name,
      nodes: d.nodes.map((i) => nodeOf(i, local.get(i)!, false)),
      links: inside.get(d.id) ?? [],
      params: d.params.map((q) => ({
        name: q.name,
        targets: q.targets.flatMap((t) =>
          local.has(t.n) ? [{ id: local.get(t.n)!, j: t.j, inv: t.inv }] : [],
        ),
      })),
    }));
    p.lanes = kf.lanes().map((l) => ({
      name: l.name,
      type: l.rand ? "R" : l.lfo ? "L" : (["P", "C", "S"] as const)[l.mode ?? 0],
      targets: l.addrs.flatMap((a) => at.get(a) ?? []),
      lfo: l.lfo ?? [],
      keys: l.keys,
    }));
    return p;
  };

  // Model -> fresh wasm state, replayed through the normal editing calls.
  // Unknown node kinds are dropped along with their links and lane targets.
  // Returns the definitions and instances with node ids turned into indices, for scene.restore() once
  // the nodes are mounted. A definition's nodes come after the main ones, so those keep their indices.
  const apply = (p: Project, decoded: Map<string, Asset>, real?: Kf): Restore => {
    wasm.project_new();
    pending.clear();
    texBoot.clear();
    ptsBoot.clear();
    drawBoot.clear();
    const at = new Map<string, number>();

    // size is derived, scene.load() fills it in
    const place = (n: PNode) => {
      const kind = kinds.findIndex((k) => k.id === n.kind);
      if (kind < 0 || wasm.add_node(kind, n.x || 0, n.y || 0, 0, 0) < 0) return -1;
      const i = wasm.nodes_len() - 1;
      new Uint8Array(wasm.memory.buffer)[wasm.get_node(i) + FLAGS_AT] = n.flags & 7;
      n.params.forEach((v, j) => {
        const a = wasm.get_param(i, j);
        if (a >= 0) f32()[a >> 2] = Math.min(Math.max(v, 0), 1);
      });
      return i;
    };

    const defIds = new Set(p.defs.map((d) => d.id));
    const insts: InstSpec[] = [];
    const instAt = new Map<string, number>();
    for (const n of p.nodes) {
      if (n.kind[0] === "&") {
        // an instance: it becomes real nodes in scene.restore()
        const def = "0x" + n.kind.slice(1);
        if (!defIds.has(def)) continue;
        instAt.set(n.id, insts.length);
        insts.push({ def, x: n.x || 0, y: n.y || 0, flags: n.flags & 7, vals: n.params });
        continue;
      }
      const i = place(n);
      if (i < 0) continue;
      at.set(n.id, i);
      // the Data node view renders it into frames when it mounts (scene.load below);
      // assets can be shared, but each node keeps its own file name
      const text = n.kind === "math" && n.asset;
      if (text) {
        const a = p.assets.find((x) => x.id === text);
        if (a) texBoot.set(i, new TextDecoder().decode(a.data));
      }
      // Waveshaper: the asset is its points as raw float32
      const pts = n.kind === "wavshape" && p.assets.find((x) => x.id === n.asset);
      if (pts) ptsBoot.set(i, decodePoints(pts.data));
      const dr = n.kind === "drawfilt" && p.assets.find((x) => x.id === n.asset);
      if (dr) drawBoot.set(i, decodeDraw(dr.data));
      const d = n.asset ? decoded.get(n.asset) : undefined;
      if (d)
        pending.set(i, {
          asset: { ...d, name: n.spec?.Nam ?? d.name },
          spec: n.spec ?? {},
        });
    }

    // nodes with state outside their params can't be copied into instances
    const STATE = ["output", "data", "math", "wavshape", "drawfilt"];
    const defs = p.defs.map((d): DefSpec => {
      const local = new Map<string, number>();
      for (const n of d.nodes) {
        const i = STATE.includes(n.kind) ? -1 : place(n);
        if (i >= 0) local.set(n.id, i);
      }
      for (const [a, sa, b, sb] of d.links)
        if (local.has(a) && local.has(b)) wasm.add_link(local.get(a)!, sa, local.get(b)!, sb);
      return {
        id: d.id,
        name: d.name,
        nodes: [...local.values()],
        params: d.params.map((q) => ({
          name: q.name,
          targets: q.targets.flatMap((t) =>
            local.has(t.id) ? [{ n: local.get(t.id)!, j: t.j, inv: t.inv }] : [],
          ),
        })),
      };
    });

    const links: Restore["links"] = [];
    const end = (id: string): EndSpec | undefined =>
      at.has(id) ? at.get(id)! : instAt.has(id) ? { i: instAt.get(id)! } : undefined;
    for (const [a, sa, b, sb] of p.links) {
      const [x, y] = [end(a), end(b)];
      if (x === undefined || y === undefined) continue;
      if (typeof x === "number" && typeof y === "number") wasm.add_link(x, sa, y, sb);
      else links.push([x, sa, y, sb]);
    }
    for (const l of p.lanes) {
      const lane = real!.addLane(
        { P: 0, C: 0, S: 0, L: 1, R: 2 }[l.type],
        { P: 0, C: 1, S: 2, L: 0, R: 0 }[l.type],
      );
      if (lane < 0) break;
      real!.rename(lane, l.name);
      l.lfo.forEach((v, j) => real!.setLfo(lane, j, v));
      if (l.type !== "L" && l.type !== "R") {
        l.keys.forEach((key) => real!.addKey(lane, Math.min(key.t, 255), key.v));
        // keys end up sorted by frame, so look each one up by it
        const live = l.keys.some((k) => k.c !== undefined) ? real!.lanes()[lane].keys : [];
        for (const k of l.keys)
          if (k.c !== undefined)
            real!.setCurve(
              lane,
              live.findIndex((x) => x.t === Math.min(k.t, 255)),
              k.c,
            );
      }
      for (const t of l.targets)
        if (at.has(t.id)) real!.link(lane, wasm.get_node(at.get(t.id)!), t.j, true);
    }
    return { defs, insts, links };
  };

  // Strip characters filesystems reject; fall back to "project".
  const base = () => fileName.value.replace(/[\\/:*?"<>|]+/g, "").trim() || "project";

  fileSave.onclick = async () => {
    const lib = await fileLib();
    const { dedupe, EXT, EXT_ZIP, format, needsZip, pack } = lib;
    const p = snapshot(lib);
    // identical Data nodes share one asset; without crypto.subtle (insecure page) they just aren't merged
    await dedupe(p).catch(() => {});
    if (needsZip(p)) download(`${base()}${EXT_ZIP}`, await pack(p), "application/zip");
    else download(`${base()}${EXT}`, format(p), "text/plain");
    fileDialog.close();
  };

  const FRAMES = 256,
    NAMES = ["", "crossfade", "spectral"];
  const syncExport = () => {
    const div = +fileQuality.value;
    fileInterp.disabled = div === 1;
    fileInfo.textContent = `.wav · ${FRAMES / div} frames · 32-bit float${
      div === 1 ? "" : ` · ${NAMES[+fileInterp.value]}`
    }`;
  };
  fileQuality.onchange = fileInterp.onchange = syncExport;
  syncExport();

  fileExport.onclick = async (e) => {
    e.preventDefault();
    const div = +fileQuality.value,
      count = FRAMES / div;

    const tables = Array.from({ length: count }, (_, i) => {
      kf.apply(count > 1 ? Math.round((i * (FRAMES - 1)) / (count - 1)) : 0);
      wasm.scope_begin();
      return scene.outputTable();
    });
    kf.apply(head());
    const interp = div === 1 ? 0 : +fileInterp.value;
    const { encodeWav } = await import("./wav");
    download(`${base()}.wav`, encodeWav(tables, interp), "audio/wav");
    fileDialog.close();
  };

  const load = async (file?: File) => {
    if (!file) return;
    let p: Project;
    try {
      const { parse, unpack } = await fileLib();
      const buf = new Uint8Array(await file.arrayBuffer());
      // zips start with "PK"
      p =
        buf[0] === 0x50 && buf[1] === 0x4b
          ? await unpack(buf)
          : parse(new TextDecoder().decode(buf));
    } catch (e) {
      fileMsg.textContent = `Not a valid project file (${(e as Error).message}).`;
      return;
    }
    // original files go back through the browser's own decoders; fails before touching the open project
    const decoded = new Map<string, Asset>();
    try {
      for (const a of p.assets) {
        const n = p.nodes.find((x) => x.asset === a.id)!;
        if (n.kind === "math" || n.kind === "wavshape" || n.kind === "drawfilt") continue; // read straight from the asset
        decoded.set(a.id, await decode(n.spec?.Typ, a.data, n.spec?.Nam ?? a.id));
      }
    } catch (e) {
      fileMsg.textContent = `Could not decode an asset (${(e as Error).message}).`;
      return;
    }
    const restored = apply(p, decoded, p.lanes.length ? await kf.load() : undefined);
    fileName.value = file.name.replace(/\.(wtp|wtx)$/i, "");
    scene.load();
    scene.restore(restored);
    // pending.clear();
    texBoot.clear();
    ptsBoot.clear();
    loaded();
    fileDialog.close();
  };

  fileBrowse.onclick = () => {
    fileInput.click();
  };
  fileInput.onchange = () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    void load(f);
  };
  fileDrop.ondragover = (e) => (e.preventDefault(), fileDrop.classList.add("over"));
  fileDrop.ondragleave = () => fileDrop.classList.remove("over");
  fileDrop.ondrop = (e) => {
    e.preventDefault();
    fileDrop.classList.remove("over");
    void load(e.dataTransfer?.files[0]);
  };

  const tools = Object.assign(document.createElement("div"), {
    className: projectCss.tools,
  });
  tools.append(
    button("Save", "Save project (Ctrl+S)", () => open("save")),
    button("Import", "Open a project (Ctrl+O)", () => open("import")),
    button("Export", "Render all 256 frames (Ctrl+E)", () => open("export")),
  );
  root.append(tools);

  const keys: Record<string, Pick> = { s: "save", o: "import", e: "export" };
  addEventListener("keydown", (e) => {
    const k = keys[e.key.toLowerCase()];
    if (!k || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    e.preventDefault();
    open(k);
  });
}
