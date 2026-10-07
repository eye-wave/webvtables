import { createSignal, For, Show, createEffect } from "solid-js";
import { render } from "solid-js/web";
import peditCss from "./param_edit.module.css";

export type ParamEdit = {
  options?: readonly string[];
  value: string;
  commit(v: string): void;
  /** Extra views of the same value (e.g. one per lane target + normalized). Shows a tab row. */
  alts?: (Omit<ParamEdit, "alts"> & { label: string })[];
};

const [open, setOpen] = createSignal<{ at: DOMRect; spec: ParamEdit }>();
let root: HTMLDivElement | undefined;
let mounted = false;

const later = (f: () => void) => setTimeout(f);

const close = () => {
  setOpen(undefined);
  removeEventListener("pointerdown", away, true);
  removeEventListener("keydown", esc, true);
};
const away = (e: Event) => {
  if (!root?.contains(e.target as Node)) close();
};
const esc = (e: KeyboardEvent) => e.key === "Escape" && close();

export function editParam(anchor: Element, spec: ParamEdit) {
  if (!mounted) ((mounted = true), render(Popup, document.body));
  setOpen({ at: anchor.getBoundingClientRect(), spec });
  addEventListener("pointerdown", away, true);
  addEventListener("keydown", esc, true);
}

function Popup() {
  const done = (spec: ParamEdit, v: string) => (spec.commit(v), close());
  return (
    <Show when={open()} keyed>
      {({ at, spec: top }) => {
        const [tab, setTab] = createSignal(0);
        const tabs = top.alts;
        const cur = () => (tabs ? tabs[tab()] : top);
        // keep the popup on screen: below the anchor, else above, else clamped
        const place = () => {
          if (!root) return;
          const h = root.offsetHeight,
            w = root.offsetWidth;
          const below = at.bottom + 4;
          const y =
            below + h <= innerHeight - 8
              ? below
              : Math.max(8, Math.min(at.top - h - 4, innerHeight - h - 8));
          root.style.top = `${y}px`;
          root.style.left = `${Math.max(8, Math.min(at.left, innerWidth - w - 8))}px`;
        };
        createEffect(() => (tab(), queueMicrotask(place)));
        return (
        <div
          class={peditCss.pedit}
          ref={(el) => ((root = el), queueMicrotask(place))}
          style={{ left: `${at.left}px`, top: `${at.bottom + 4}px` }}
        >
          <Show when={tabs}>
            <div class={peditCss.tabs}>
              <For each={tabs}>
                {(a, i) => (
                  <button
                    classList={{ [peditCss.on]: tab() === i() }}
                    onClick={() => setTab(i())}
                  >
                    {a.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={cur()} keyed>
            {(spec) => (<>
          {spec.options ? (
            <select
              size={spec.options.length}
              ref={(el) => later(() => el.focus())}
              onClick={(e) => done(spec, e.currentTarget.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && done(spec, e.currentTarget.value)
              }
            >
              <For each={spec.options}>
                {(o, i) => (
                  <option value={i()} selected={i() === +spec.value}>
                    {o}
                  </option>
                )}
              </For>
            </select>
          ) : (
            <input
              value={spec.value}
              spellcheck={false}
              ref={(el) => later(() => (el.focus(), el.select()))}
              onKeyDown={(e) =>
                e.key === "Enter" && done(spec, e.currentTarget.value)
              }
            />
          )}
            </>)}
          </Show>
        </div>
        );
      }}
    </Show>
  );
}
