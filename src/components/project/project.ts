import { nodes as kinds } from "../../generated/nodes";
import type { Kf } from "../../editor/kf";
import type { Scene } from "../../editor/scene";
import type { WasmExports } from "../../wasm";
import { decode, pending, savedAt, type Asset } from "../node/data_asset";
import { dedupe, EXT, EXT_ZIP, format, newIds, pack, parse, unpack, type Project } from "./file";
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

// interp: 0 none, 1 crossfade, 2 spectral
export function encodeWav(tables: Float32Array[], interp = 0, rate = 44100) {
  const len = tables.reduce((n, t) => n + t.length, 0);
  const sig = "Made with [https://github.com/username/webvtables] ";

  const xferHeaderBlock = [
    99,
    108,
    109,
    32,
    42,
    0,
    0,
    0,
    ...[...`<!>2048 ${interp}0000000 `].map((c) => c.charCodeAt(0)),
  ];

  const headerSize =
    12 + 24 + 12 + 8 + (xferHeaderBlock.length - 8) + sig.length + 8;
  const dataStart =
    headerSize + (headerSize % 4 !== 0 ? 4 - (headerSize % 4) : 0);

  const buf = new ArrayBuffer(dataStart + len * 4);
  const v = new DataView(buf);

  let o = 0;

  const str = (s: string) =>
    [...s].forEach((c) => v.setUint8(o++, c.charCodeAt(0)));
  const u32 = (n: number) => (v.setUint32(o, n, true), (o += 4));
  const u16 = (n: number) => (v.setUint16(o, n, true), (o += 2));
  (str("RIFF"), u32(buf.byteLength - 8), str("WAVE"));
  (str("fmt "),
    u32(16),
    u16(3),
    u16(1),
    u32(rate),
    u32(rate * 4),
    u16(4),
    u16(32));

  (str("clm "),
    u32(xferHeaderBlock.length - 8 + sig.length),
    xferHeaderBlock.slice(8).forEach((b) => v.setUint8(o++, b)),
    str(sig));

  (str("data"), u32(len * 4));
  o = dataStart;
  const out = new Float32Array(buf, o, len);
  let k = 0;
  for (const t of tables) out.set(t, (k += t.length) - t.length);
  return buf;
}

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
  kf: Kf,
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
    for (const k in rows)
      rows[k as Pick].toggleAttribute("data-pick", k === pick);
    focus[pick].focus();
  };
  fileDialog.onclose = () => (fileDialog.style.display = "none");
  fileClose.onclick = () => fileDialog.close();
  fileDialog.onclick = (e) => e.target === fileDialog && fileDialog.close();

  const f32 = () => new Float32Array(wasm.memory.buffer);
  const FLAGS_AT = 17; // byte offset of Node.flags (see scene.ts)

  // Live state -> model. Node ids exist only in the file, so they are made up here.
  const snapshot = (): Project => {
    const n = wasm.nodes_len();
    const ids = newIds(n);
    const aids = newIds(n, 20); // spare ids; only nodes holding data use one
    const at = new Map<number, { id: string; j: number }>();
    const p: Project = { nodes: [], links: [], lanes: [], assets: [] };
    for (let i = 0; i < n; i++) {
      const [x, y] = f32().subarray(
        wasm.get_node(i) >> 2,
        (wasm.get_node(i) >> 2) + 2,
      );
      const params: number[] = [];
      for (let j = 0, a; (a = wasm.get_param(i, j)) >= 0; j++) {
        params.push(f32()[a >> 2]);
        at.set(a, { id: ids[i], j });
      }
      const flags = new Uint8Array(wasm.memory.buffer)[
        wasm.get_node(i) + FLAGS_AT
      ];
      const d = savedAt(i); // the original import and its settings, not the rendered frames
      if (d) p.assets.push({ id: aids[i], data: d.bytes });
      p.nodes.push({
        id: ids[i],
        kind: kinds[wasm.node_kind(i)].id,
        params,
        x,
        y,
        flags,
        asset: d ? aids[i] : undefined,
        spec: d?.spec,
      });
    }
    const u8 = new Uint8Array(wasm.memory.buffer),
      u16 = new Uint16Array(wasm.memory.buffer);
    for (let i = 0; i < wasm.links_len(); i++) {
      const a = wasm.get_link(i);
      p.links.push([
        ids[u16[a >> 1]],
        u8[a + 2],
        ids[u16[(a >> 1) + 2]],
        u8[a + 6],
      ]);
    }
    p.lanes = kf.lanes().map((l) => ({
      name: l.name,
      type: l.lfo ? "L" : (["P", "C", "S"] as const)[l.mode ?? 0],
      targets: l.addrs.flatMap((a) => at.get(a) ?? []),
      lfo: l.lfo ?? [],
      keys: l.keys,
    }));
    return p;
  };

  // Model -> fresh wasm state, replayed through the normal editing calls.
  // Unknown node kinds are dropped along with their links and lane targets.
  const apply = (p: Project, decoded: Map<string, Asset>) => {
    wasm.project_new();
    pending.clear();
    const at = new Map<string, number>();
    for (const n of p.nodes) {
      const kind = kinds.findIndex((k) => k.id === n.kind);
      // size is derived, scene.load() fills it in
      if (kind < 0 || wasm.add_node(kind, n.x || 0, n.y || 0, 0, 0) < 0)
        continue;
      const i = wasm.nodes_len() - 1;
      at.set(n.id, i);
      new Uint8Array(wasm.memory.buffer)[wasm.get_node(i) + FLAGS_AT] =
        n.flags & 7;
      n.params.forEach((v, j) => {
        const a = wasm.get_param(i, j);
        if (a >= 0) f32()[a >> 2] = Math.min(Math.max(v, 0), 1);
      });
      // the Data node view renders it into frames when it mounts (scene.load below);
      // assets can be shared, but each node keeps its own file name
      const d = n.asset ? decoded.get(n.asset) : undefined;
      if (d) pending.set(i, { asset: { ...d, name: n.spec?.Nam ?? d.name }, spec: n.spec ?? {} });
    }
    for (const [a, sa, b, sb] of p.links)
      if (at.has(a) && at.has(b)) wasm.add_link(at.get(a)!, sa, at.get(b)!, sb);
    for (const l of p.lanes) {
      const lane = kf.addLane(
        l.type === "L",
        { P: 0, C: 1, S: 2, L: 0 }[l.type],
      );
      if (lane < 0) break;
      kf.rename(lane, l.name);
      l.lfo.forEach((v, j) => kf.setLfo(lane, j, v));
      if (l.type !== "L") {
        l.keys.forEach((k) => kf.addKey(lane, Math.min(k.t, 255), k.v));
        // keys end up sorted by frame, so look each one up by it
        const live = l.keys.some((k) => k.c !== undefined)
          ? kf.lanes()[lane].keys
          : [];
        for (const k of l.keys)
          if (k.c !== undefined)
            kf.setCurve(
              lane,
              live.findIndex((x) => x.t === Math.min(k.t, 255)),
              k.c,
            );
      }
      for (const t of l.targets)
        if (at.has(t.id))
          kf.link(lane, wasm.get_node(at.get(t.id)!), t.j, true);
    }
  };

  // Strip characters filesystems reject; fall back to "project".
  const base = () =>
    fileName.value.replace(/[\\/:*?"<>|]+/g, "").trim() || "project";

  fileSave.onclick = async () => {
    const p = snapshot();
    // identical Data nodes share one asset; without crypto.subtle (insecure page) they just aren't merged
    await dedupe(p).catch(() => {});
    if (p.assets.length) download(`${base()}${EXT_ZIP}`, pack(p), "application/zip");
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

  fileExport.onclick = (e) => {
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
    download(`${base()}.wav`, encodeWav(tables, interp), "audio/wav");
    fileDialog.close();
  };

  const load = async (file?: File) => {
    if (!file) return;
    let p: Project;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      // zips start with "PK"
      p = buf[0] === 0x50 && buf[1] === 0x4b ? unpack(buf) : parse(new TextDecoder().decode(buf));
    } catch (e) {
      fileMsg.textContent = `Not a valid project file (${(e as Error).message}).`;
      return;
    }
    // original files go back through the browser's own decoders; fails before touching the open project
    const decoded = new Map<string, Asset>();
    try {
      for (const a of p.assets) {
        const n = p.nodes.find((x) => x.asset === a.id)!;
        decoded.set(a.id, await decode(n.spec?.Typ, a.data, n.spec?.Nam ?? a.id));
      }
    } catch (e) {
      fileMsg.textContent = `Could not decode an asset (${(e as Error).message}).`;
      return;
    }
    apply(p, decoded);
    fileName.value = file.name.replace(/\.(wtp|wtx)$/i, "");
    scene.load();
    pending.clear();
    loaded();
    fileDialog.close();
  };

  fileBrowse.onclick = () => {
    fileInput.click();
  };
  fileInput.onchange = () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    load(f);
  };
  fileDrop.ondragover = (e) => (
    e.preventDefault(),
    fileDrop.classList.add("over")
  );
  fileDrop.ondragleave = () => fileDrop.classList.remove("over");
  fileDrop.ondrop = (e) => {
    e.preventDefault();
    fileDrop.classList.remove("over");
    load(e.dataTransfer?.files[0]);
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
