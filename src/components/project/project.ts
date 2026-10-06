import type { Kf } from "../../editor/kf";
import type { Scene } from "../../editor/scene";
import type { WasmExports } from "../../wasm";
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

export function encodeWav(tables: Float32Array[], rate = 44100) {
  const len = tables.reduce((n, t) => n + t.length, 0);
  const sig = "Made with [https://github.com/username/webvtables] ";

  const xferHeaderBlock = [
    99, 108, 109, 32, 42, 0, 0, 0, 60, 33, 62, 50, 48, 52, 56, 32, 50, 48, 48,
    48, 48, 48, 48, 48, 32,
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
    export: fileExport.parentElement!,
  };
  const focus: Record<Pick, HTMLElement> = {
    save: fileSave,
    import: fileBrowse,
    export: fileExport,
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

  // Strip characters filesystems reject; fall back to "project".
  const base = () =>
    fileName.value.replace(/[\\/:*?"<>|]+/g, "").trim() || "project";

  fileSave.onclick = () => {
    const n = wasm.project_save();
    download(
      `${base()}.wtp`,
      new Uint8Array(wasm.memory.buffer, wasm.project_ptr(), n).slice(),
      "application/octet-stream",
    );
    fileDialog.close();
  };

  fileExport.onclick = () => {
    const tables = Array.from({ length: 256 }, (_, f) => {
      kf.apply(f);
      wasm.scope_begin();
      return scene.outputTable();
    });
    kf.apply(head());
    download(`${base()}.wav`, encodeWav(tables), "audio/wav");
    fileDialog.close();
  };

  const load = async (file?: File) => {
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ptr = wasm.project_buf(bytes.length);
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
    if (!wasm.project_load(bytes.length)) {
      fileMsg.textContent = "Not a valid project file.";
      return;
    }
    fileName.value = file.name.replace(/\.wtp$/i, "");
    scene.load();
    loaded();
    fileDialog.close();
  };

  fileBrowse.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const f = fileInput.files?.[0];
    fileInput.value = "";
    load(f);
  };
  fileDrop.ondragover = (e) => (e.preventDefault(), fileDrop.classList.add("over"));
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
    button("Export .wav", "Render all 256 frames (Ctrl+E)", () => open("export")),
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
