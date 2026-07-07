import { createDraggable } from "@eyewave/web-knobs/core/draggable";
import { describeArc } from "@eyewave/web-knobs/core/helpers";
import { LogParam } from "@eyewave/web-knobs/core/params";
import { player } from "./engine";

const ns = "http://www.w3.org/2000/svg";

declare const header_freq: HTMLDivElement;
declare const header_volume: HTMLDivElement;

const makeDraw =
  (path: SVGPathElement, text: SVGTextElement, fmt: (v: number) => string) =>
  (v: number) => {
    path.setAttribute("d", describeArc(24, 24, 22, v));
    text.textContent = fmt(v);
  };

const bindKnob = (
  container: HTMLElement,
  defaultVal: number,
  color: string,
  onChange: (v: number) => void,
  fmt: (v: number) => string,
) => {
  const path = document.createElementNS(ns, "path");
  const text = document.createElementNS(ns, "text");

  const draw = makeDraw(path, text, fmt);

  text.setAttribute("x", "24");
  text.setAttribute("y", "24");
  text.setAttribute("font-size", "12");
  text.setAttribute("fill", color);

  path.setAttribute("stroke", color);
  path.setAttribute("fill", "none");

  container.append(path);
  container.append(text);

  createDraggable(container, {
    onValueChange: (v) => {
      onChange(v);
      draw(v);
    },
    value: defaultVal,
  });

  draw(defaultVal);
};
export function createKnobs() {
  const param = new LogParam(10, 12000);

  bindKnob(
    header_volume,
    0.1,
    "red",
    (v) => {
      try {
        player.volume.setValueAtTime(v, 0.1);
      } catch {
        player._cached_vol = v;
      }
    },
    (v) => v.toFixed(2),
  );
  bindKnob(
    header_freq,
    0.2,
    "cyan",
    (v) => {
      const denorm = param.denormalize(v);
      try {
        player.frequency.setValueAtTime(denorm, 0.1);
      } catch {
        player._cached_freq = denorm;
      }
    },
    (v) => {
      const denorm = param.denormalize(v);

      if (denorm > 1000) {
        return (denorm / 1000).toFixed(0) + "kHz";
      }
      return denorm.toFixed(0) + "Hz";
    },
  );
}
