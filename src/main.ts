import "./style.css";
import { loadWasm } from "./wasm";

loadWasm().then((wasm) => {
  wasm.add_link(1, 2, 3, 4);

  console.log(wasm.links_len());

  const ptr = wasm.get_link(0);
  const view = new DataView(wasm.memory.buffer);

  const s1 = view.getUint16(ptr + 0, true);
  const s2 = view.getUint8(ptr + 2);
  const t1 = view.getUint16(ptr + 4, true);
  const t2 = view.getUint8(ptr + 6);

  console.log(s1, s2, t1, t2);
});
