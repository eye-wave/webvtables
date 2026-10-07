import { createEffect, createRoot, For } from "solid-js";
import { createStore } from "solid-js/store";
import { render } from "solid-js/web";
import Cog from "lucide-solid/icons/settings";
import { FPSMeter } from "lite-fps-meter";
import type { WasmExports } from "../../wasm";
import projectCss from "../project/project.module.css";

declare const fps: HTMLDivElement;
const fpsEl = fps;

const ROPE = [
  [0, "Segments", 10, 2, 64, 1],
  [1, "Timestep (s)", 1 / 60, 0.002, 0.1, 0.001],
  [2, "Gravity", 0.35, -2, 2, 0.01],
  [3, "Damping", 0.97, 0, 1, 0.005],
  [4, "Solver iterations", 8, 1, 64, 1],
  [5, "Sleep threshold", 0.02, 0, 1, 0.005],
  [6, "Slack factor", 1.03, 1, 2, 0.01],
  [7, "Slack (px)", 12, 0, 200, 1],
] as const;

const RANGES = {
  dark: { h: [0, 360], s: [55, 85], b: [80, 100] },
  light: { h: [0, 360], s: [70, 95], b: [50, 75] },
} as const;
const AXES = [
  ["h", "Hue", 360],
  ["s", "Saturation", 100],
  ["b", "Brightness", 100],
] as const;

const KEY = "wt-settings";
const DEFAULTS: Record<string, string | number> = {
  theme: "dark",
  freq: 220,
  fps: 0,
  ...Object.fromEntries(
    Object.entries(RANGES).flatMap(([t, r]) =>
      Object.entries(r).flatMap(([a, [lo, hi]]) => [
        [`${t}.${a}0`, lo],
        [`${t}.${a}1`, hi],
      ]),
    ),
  ),
  ...Object.fromEntries(ROPE.map(([i, , d]) => [`r${i}`, d])),
};

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      ...DEFAULTS,
      ...saved,
      fps: saved.fps !== undefined ? Number(saved.fps) : DEFAULTS.fps,
      freq: saved.freq !== undefined ? Number(saved.freq) : DEFAULTS.freq,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

export const [settings, set] = createStore(load());

const applyTheme = () =>
  (document.documentElement.dataset.theme = String(settings.theme));
applyTheme();

const rnd = (n: number) => {
  let t = (n + 1) * 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

export function randColor(
  seed: number,
  [h0, h1]: readonly number[],
  [s0, s1]: readonly number[],
  [b0, b1]: readonly number[],
  dh = 0,
) {
  const h = dh + h0 + rnd(seed * 3) * (h1 - h0),
    s = (s0 + rnd(seed * 3 + 1) * (s1 - s0)) / 100,
    v = (b0 + rnd(seed * 3 + 2) * (b1 - b0)) / 100,
    l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${sl * 100}% ${l * 100}%)`;
}

export function laneColors(i: number, special: boolean) {
  const t = settings.theme;
  const r = (a: string) => [+settings[`${t}.${a}0`], +settings[`${t}.${a}1`]];
  const [h, s, b] = [r("h"), r("s"), r("b")];
  const c = randColor(i, h, s, b);
  if (!special) return { c, c2: c };
  return { c, c2: randColor(i, h, s, b, 30 + rnd(i + 1000) * 20) };
}

let meter: FPSMeter | undefined;
export const fpsTick = () => meter?.tick(performance.now());

createRoot(() =>
  createEffect(() => {
    fpsEl.hidden = !settings.fps;
    if (settings.fps && !meter) {
      meter = new FPSMeter({
        loop: false,
        targetFps: 60,
        graph: true,
        target: fpsEl,
        textUpdateInterval: 30,
      });

      Object.assign((meter as any).container.style, {
        position: "absolute",
        top: "6px",
        left: "8px",
      });
    } else if (!settings.fps) (meter?.destroy(), (meter = undefined));
  }),
);

declare const settingsDialog: HTMLDialogElement;
declare const settingsRoot: HTMLElement;

export function createSettings(bar: HTMLElement, wasm: WasmExports) {
  const pushRope = () =>
    ROPE.forEach(([i]) => wasm.rope_cfg(i, +settings[`r${i}`]));
  pushRope();

  const change = (k: string, v: string | number, then?: () => void) => {
    set(k, v);

    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {}
    then?.();
  };

  const num = (e: Event & { currentTarget: HTMLInputElement }) => {
    const v = e.currentTarget.valueAsNumber;
    return isNaN(v) ? undefined : v;
  };

  const open = () => {
    settingsDialog.style.display = "";
    if (!settingsDialog.open) settingsDialog.showModal();
  };
  settingsDialog.onclose = () => (settingsDialog.style.display = "none");

  render(
    () => (
      <>
        <header>
          <h2>Settings</h2>
          <button
            id="settingsClose"
            type="button"
            title="Close"
            onClick={() => settingsDialog.close()}
          >
            ×
          </button>
        </header>
        <div class="set-grid">
          <h3>App</h3>
          <label for="setTheme">Theme</label>
          <select
            id="setTheme"
            value={settings.theme}
            onChange={(e) => change("theme", e.currentTarget.value, applyTheme)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <label for="setFreq">Default frequency (Hz)</label>
          <input
            id="setFreq"
            type="number"
            min="20"
            max="2000"
            value={settings.freq}
            onChange={(e) => {
              const v = num(e);
              if (v) change("freq", Math.min(2000, Math.max(20, v)));
            }}
          />
          <small style={{ "grid-column": "1 / -1" }}>
            Applies on next load and when the Freq knob is reset.
          </small>

          <label for="setFps">Show FPS counter</label>
          <input
            id="setFps"
            type="checkbox"
            checked={settings.fps === 1}
            onChange={(e) => change("fps", e.currentTarget.checked ? 1 : 0)}
          />

          <h3>Lane colors · {settings.theme}</h3>
          <For each={AXES}>
            {([a, name, max]) => (
              <>
                <label>{name}</label>
                <div style={{ display: "flex", gap: "4px" }}>
                  <For each={[0, 1]}>
                    {(k) => (
                      <input
                        type="number"
                        min="0"
                        max={max}
                        style={{ width: "100%" }}
                        aria-label={`${name} ${k ? "max" : "min"}`}
                        value={settings[`${settings.theme}.${a}${k}`]}
                        onChange={(e) => {
                          const v = num(e);
                          if (v !== undefined)
                            change(
                              `${settings.theme}.${a}${k}`,
                              Math.min(max, Math.max(0, v)),
                            );
                        }}
                      />
                    )}
                  </For>
                </div>
              </>
            )}
          </For>

          <h3>Rope physics</h3>
          <For each={ROPE}>
            {([i, name, , min, max, step]) => (
              <>
                <label for={`set${i}`}>{name}</label>
                <input
                  id={`set${i}`}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={settings[`r${i}`]}
                  onChange={(e) => {
                    const v = num(e);
                    if (v !== undefined)
                      change(`r${i}`, Math.min(max, Math.max(min, v)), () =>
                        wasm.rope_cfg(i, v),
                      );
                  }}
                />
              </>
            )}
          </For>
        </div>
        <button
          type="button"
          style={{ "align-self": "flex-end" }}
          onClick={() => {
            Object.entries(DEFAULTS).forEach(([k, v]) => change(k, v));
            applyTheme();
            pushRope();
          }}
        >
          Reset to defaults
        </button>
      </>
    ),
    settingsRoot,
  );

  const slot = document.createElement("div");
  bar.append(slot);
  render(
    () => (
      <button
        class={projectCss.tool}
        title="Settings"
        aria-label="Settings"
        onClick={open}
      >
        <Cog size={14} />
      </button>
    ),
    slot,
  );
}
