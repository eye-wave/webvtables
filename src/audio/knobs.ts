import {
  createDraggable,
  DEFAULT_KNOB_VALUE,
} from "@eyewave/web-knobs/core/draggable";
import { describeArc } from "@eyewave/web-knobs/core/helpers";
import { LogParam } from "@eyewave/web-knobs/core/params";

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
  color: string,
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

  createDraggable(container, { onValueChange: draw });

  draw(DEFAULT_KNOB_VALUE);
};
export function createKnobs() {
  const param = new LogParam(10, 12000);

  bindKnob(header_freq, "red", (v) => v.toFixed(1));
  bindKnob(header_volume, "cyan", (v) => {
    const denorm = param.denormalize(v);

    if (denorm > 1000) {
      return (denorm / 1000).toFixed(0) + "kHz";
    }
    return denorm.toFixed(0) + "Hz";
  });
}
