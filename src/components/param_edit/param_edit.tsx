import { createSignal, For, Show } from "solid-js";
import { render } from "solid-js/web";
import peditCss from "./param_edit.module.css";

export type ParamEdit = {
  options?: readonly string[];
  value: string;
  commit(v: string): void;
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
      {({ at, spec }) => (
        <div
          class={peditCss.pedit}
          ref={root}
          style={{
            left: `${Math.max(0, Math.min(at.left, innerWidth - 168))}px`,
            top: `${at.bottom + 4}px`,
          }}
        >
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
        </div>
      )}
    </Show>
  );
}
