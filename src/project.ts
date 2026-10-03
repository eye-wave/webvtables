import type { Kf } from "./kf";
import type { Scene } from "./scene";
import type { WasmExports } from "./wasm";

const button = (text: string, title: string, onclick: () => void) =>
  Object.assign(document.createElement("button"), {
    className: "tool",
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

export function createProject(
  root: HTMLElement,
  wasm: WasmExports,
  scene: Scene,
  kf: Kf,
  head: () => number,
  loaded: () => void,
) {
  const pick = Object.assign(document.createElement("input"), {
    type: "file",
    accept: ".wtp",
    hidden: true,
    onchange: async () => {
      const file = pick.files?.[0];
      pick.value = "";
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());

      const ptr = wasm.project_buf(bytes.length);
      new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
      if (!wasm.project_load(bytes.length))
        return alert("Not a valid project file.");
      scene.load();
      loaded();
    },
  });

  const tools = Object.assign(document.createElement("div"), {
    className: "tools",
  });
  tools.append(
    button("Save", "Save project", () => {
      const n = wasm.project_save();
      download(
        "project.wtp",
        new Uint8Array(wasm.memory.buffer, wasm.project_ptr(), n).slice(),
        "application/octet-stream",
      );
    }),
    button("Import", "Open a project", () => pick.click()),
    button("Export .wav", "Render all 256 frames to a wavetable", () => {
      const tables = Array.from({ length: 256 }, (_, f) => {
        kf.apply(f);
        wasm.scope_begin();
        return scene.outputTable();
      });
      kf.apply(head());
      download("wavetable.wav", encodeWav(tables), "audio/wav");
    }),
    pick,
  );
  root.append(tools);
}
