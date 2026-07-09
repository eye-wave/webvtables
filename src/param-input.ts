declare const param_n_input: HTMLInputElement;
declare const param_e_input: HTMLSelectElement;

function readHeader(mem: WebAssembly.Memory, ptr: const_u8) {
  const view = new DataView(mem.buffer, ptr, 52);
  return {
    node_id: view.getUint32(0, true),
    param_id: view.getUint32(4, true),
    x: view.getFloat32(8, true),
    y: view.getFloat32(12, true),
    w: view.getFloat32(16, true),
    h: view.getFloat32(20, true),
    zoom: view.getFloat32(24, true),
    view,
  };
}

function placeInput(
  el: HTMLElement,
  node_id: number,
  param_id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom: number,
) {
  el.style.width = w + "px";
  el.style.height = h + "px";
  el.style.transform = `translate(${x}px,${y}px)`;
  el.style.fontSize = 13 * zoom + "px";
  el.style.display = "";
  el.dataset.nodeId = String(node_id);
  el.dataset.paramId = String(param_id);
}

export function openFloatParam(mem: WebAssembly.Memory, ptr: const_u8) {
  const { node_id, param_id, x, y, w, h, zoom, view } = readHeader(mem, ptr);

  const value = view.getFloat64(28, true);
  const min = view.getFloat64(36, true);
  const max = view.getFloat64(44, true);

  param_n_input.min = String(min);
  param_n_input.max = String(max); // was: `.min = max` (bug — max never applied)
  param_n_input.step = "0.001";
  param_n_input.value = value.toFixed(2);

  placeInput(param_n_input, node_id, param_id, x, y, w, h, zoom);
  requestAnimationFrame(() => param_n_input.focus());
}

export function openEnumParam(
  mem: WebAssembly.Memory,
  ptr: const_u8,
  var_len: usize,
) {
  const { node_id, param_id, x, y, w, h, zoom, view } = readHeader(mem, ptr);

  const value = view.getFloat64(28, true) | 0;
  const str_ptr = view.getUint32(36, true);

  param_e_input.replaceChildren();

  const buf = new Uint32Array(mem.buffer, str_ptr, var_len * 2);
  for (let i = 0; i < var_len; i++) {
    const p = buf[i * 2];
    const len = buf[i * 2 + 1];
    const text = new TextDecoder().decode(new Uint8Array(mem.buffer, p, len));

    const opt = document.createElement("option");
    opt.textContent = text;
    opt.value = String(i);
    opt.selected = i === value;
    param_e_input.append(opt);
  }

  placeInput(param_e_input, node_id, param_id, x, y, w, h, zoom);
  requestAnimationFrame(() => param_e_input.showPicker());
}

export function hideInputs() {
  for (const el of [param_n_input, param_e_input]) {
    el.style.display = "none";
    el.blur();
  }
}

export function registerParamInputs(
  commit: (node_id: usize, param_id: usize, val_denorm: number) => void,
) {
  function commitAndHide(el: HTMLInputElement | HTMLSelectElement) {
    el.style.display = "none";
    commit(
      (+(el.dataset.nodeId ?? 0) | 0) as usize,
      (+(el.dataset.paramId ?? 0) | 0) as usize,
      +el.value,
    );
  }

  param_n_input.onblur = () => commitAndHide(param_n_input);
  param_n_input.onwheel = (e) => e.preventDefault();
  param_n_input.onkeydown = (e) => {
    if (e.key === "Enter") commitAndHide(param_n_input);
  };

  let isOpen = false;
  param_e_input.onblur = () => commitAndHide(param_e_input);
  param_e_input.oninput = () => commitAndHide(param_e_input);
  param_e_input.onclick = () => {
    isOpen = !isOpen;
    if (!isOpen) commitAndHide(param_e_input);
  };
  param_e_input.onwheel = (e) => e.preventDefault();
}
