import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import type { Audio } from "./audio";
import { fineScale } from "./fine";
import { editParam } from "./param_edit";

const FREQ_MIN = 20,
  FREQ_MAX = 2000,
  SPEED_MAX = 255;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

function BarKnob(props: {
  name: string;
  unit: string;
  v0: number;
  show: (v: number) => string;
  parse: (s: string) => number;
  apply: (v: number) => void;
}) {
  const [v, setV] = createSignal(props.v0);
  const set = (x: number) => (setV(clamp(x)), props.apply(v()));
  let drag: { y: number; v: number } | undefined;
  props.apply(props.v0);

  const edit = (el: Element) =>
    editParam(el, {
      value: props.show(v()),
      commit: (s) => {
        const n = props.parse(s);
        if (!isNaN(n)) set(n);
      },
    });

  return (
    <div
      class="knob"
      style={{ "--v": v() }}
      onPointerDown={(e) => {
        if (e.button) return;
        if (e.ctrlKey) return edit(e.currentTarget);
        e.currentTarget.setPointerCapture(e.pointerId);
        drag = { y: e.clientY, v: v() };
      }}
      onPointerMove={(e) =>
        drag && set(drag.v + ((drag.y - e.clientY) / 150) * fineScale(e))
      }
      onPointerUp={() => (drag = undefined)}
      onPointerCancel={() => (drag = undefined)}
      onWheel={(e) => (
        e.preventDefault(),
        set(v() - Math.sign(e.deltaY) * 0.02)
      )}
      onContextMenu={(e) => (e.preventDefault(), edit(e.currentTarget))}
    >
      <div class="dial" />
      <div class="pname">{props.name}</div>
      <div class="pval">
        {props.show(v())} {props.unit}
      </div>
    </div>
  );
}

export function createTransport(
  root: HTMLElement,
  audio: Audio,
  wake: () => void,
) {
  let playing = false;
  let speed = 32;
  const [on, setOn] = createSignal(false);

  const fps = (v: number) => SPEED_MAX ** v;
  const hz = (v: number) => FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** v;
  const log = (x: number, lo: number, hi: number) =>
    Math.log(x / lo) / Math.log(hi / lo);
  const dec = (x: number, at: number) =>
    x < at ? x.toFixed(1) : `${Math.round(x)}`;

  render(
    () => (
      <>
        <button
          class="play"
          classList={{ active: on() }}
          title="Play / pause"
          onClick={async () => {
            setOn((playing = await audio.toggle()));
            wake();
          }}
        >
          {on() ? "⏸" : "▶"}
        </button>
        <BarKnob
          name="Freq"
          unit="Hz"
          v0={log(220, FREQ_MIN, FREQ_MAX)}
          show={(v) => dec(hz(v), 100)}
          parse={(s) => log(parseFloat(s), FREQ_MIN, FREQ_MAX)}
          apply={(v) => audio.setFreq(hz(v))}
        />
        <BarKnob
          name="Volume"
          unit="%"
          v0={0.5}
          show={(v) => `${Math.round(v * 100)}`}
          parse={(s) => parseFloat(s) / 100}
          apply={(v) => audio.setVolume(v * v)}
        />
        <BarKnob
          name="Speed"
          unit="fr/s"
          v0={log(speed, 1, SPEED_MAX)}
          show={(v) => dec(fps(v), 10)}
          parse={(s) => log(parseFloat(s), 1, SPEED_MAX)}
          apply={(v) => (speed = fps(v))}
        />
      </>
    ),
    root,
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
