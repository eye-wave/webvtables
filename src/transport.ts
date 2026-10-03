import type { Audio } from "./audio";

const FREQ_MIN = 20,
  FREQ_MAX = 2000,
  SPEED_MAX = 255;

const div = (cls: string, text = "") =>
  Object.assign(document.createElement("div"), {
    className: cls,
    textContent: text,
  });

function knob(
  name: string,
  v0: number,
  show: (v: number) => string,
  apply: (v: number) => void,
) {
  const el = div("knob");
  const val = div("pval");
  el.append(div("dial"), div("pname", name), val);

  let v = v0;
  const set = (x: number) => {
    v = Math.min(1, Math.max(0, x));
    el.style.setProperty("--v", `${v}`);
    val.textContent = show(v);
    apply(v);
  };

  el.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY,
      start = v;
    const move = (e: PointerEvent) =>
      set(start + ((y0 - e.clientY) / 150) * (e.shiftKey ? 0.1 : 1));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      set(v - Math.sign(e.deltaY) * 0.02);
    },
    { passive: false },
  );

  set(v0);
  return el;
}

export function createTransport(
  root: HTMLElement,
  audio: Audio,
  wake: () => void,
) {
  let playing = false;
  let speed = 32;
  const play = Object.assign(document.createElement("button"), {
    className: "play",
    textContent: "▶",
    title: "Play / pause",
  });
  play.addEventListener("click", async () => {
    const on = (playing = await audio.toggle());
    play.textContent = on ? "⏸" : "▶";
    play.classList.toggle("active", on);
    wake();
  });

  const fps = (v: number) => SPEED_MAX ** v;
  const hz = (v: number) => FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** v;
  root.append(
    play,
    knob(
      "Freq",
      Math.log(220 / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN),
      (v) => `${hz(v) < 100 ? hz(v).toFixed(1) : Math.round(hz(v))} Hz`,
      (v) => audio.setFreq(hz(v)),
    ),
    knob(
      "Volume",
      0.5,
      (v) => `${Math.round(v * 100)} %`,
      (v) => audio.setVolume(v * v),
    ),
    knob(
      "Speed",
      Math.log(speed) / Math.log(SPEED_MAX),
      (v) => `${fps(v) < 10 ? fps(v).toFixed(1) : Math.round(fps(v))} fr/s`,
      (v) => (speed = fps(v)),
    ),
  );

  return {
    get playing() {
      return playing;
    },
    get speed() {
      return speed;
    },
  };
}
