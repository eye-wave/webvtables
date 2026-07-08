declare const param_n_input: HTMLInputElement;
declare const param_e_input: HTMLInputElement;

export function open_float_param(
  node_id: usize,
  param_id: usize,
  x: f32,
  y: f32,
  w: f32,
  h: f32,
  zoom: f32,
  value: f64,
  min: f64,
  max: f64,
) {
  param_n_input.min = min as unknown as string;
  param_n_input.min = max as unknown as string;
  param_n_input.step = 0.001 as unknown as string;
  param_n_input.value = value.toFixed(2);

  param_n_input.style.width = w + "px";
  param_n_input.style.height = h + "px";
  param_n_input.style.transform = `translate(${x}px,${y}px)`;
  param_n_input.style.fontSize = 13 * zoom + "px";

  param_n_input.style.display = "";
  param_n_input.dataset.nodeId = node_id as unknown as string;
  param_n_input.dataset.paramId = param_id as unknown as string;

  requestAnimationFrame(() => param_n_input.focus());
}

export function hideInputs() {
  param_n_input.style.display = "none";
  param_e_input.style.display = "none";

  param_n_input.blur();
  param_e_input.blur();
}

export function registerParamInputs(
  commit: (node_id: usize, param_id: usize, val_denorm: number) => void,
) {
  function onInput() {
    param_n_input.style.display = "none";

    const n = +(param_n_input.dataset?.nodeId ?? 0) | 0;
    const p = +(param_n_input.dataset?.paramId ?? 0) | 0;
    const val = +param_n_input.value;

    commit(n as usize, p as usize, val);
  }

  param_n_input.onwheel = (e) => e.preventDefault();

  param_n_input.onblur = onInput;
  param_n_input.onkeydown = (e) => {
    if (e.key === "Enter") onInput();
  };
}
