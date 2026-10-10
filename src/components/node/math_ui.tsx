import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  DEFAULT_TEX,
  dropMath,
  loadMath,
  onMathProgress,
  setMath,
  setTex,
  texBoot,
  type MathField,
} from "./math";
import { Flags, Head, Knob, Scope, useNode } from "./node";
import knobCss from "./knob.module.css";
import css from "./math_ui.module.css";

// Desmos-style typing: Greek names, sum/prod/int/sqrt/nthroot templates and function names turn into
// math as you type (`sum` opens a sigma with `n=` ready). x runs over [0, 1) across the table, a..d are
// the knobs, p q r the sample under x from the three inputs; the scope plots the result.
const GREEK =
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega";
const FUNCS =
  "sin cos tan csc sec cot arcsin arccos arctan arccsc arcsec arccot sinh cosh tanh csch sech coth ln log exp abs sign floor ceil round mod gcd lcm min max mean median total length";

export function MathView() {
  const ctx = useNode();
  const initial = texBoot.get(ctx.i) ?? DEFAULT_TEX; // from a loaded project, else the default
  texBoot.delete(ctx.i);
  setTex(ctx.p, initial);
  const [bad, setBad] = createSignal(false);
  const [load, setLoad] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  onCleanup(onMathProgress(setLoad));
  let host!: HTMLDivElement;
  let field: MathField | undefined;
  let dead = false;

  const [failed, setFailed] = createSignal(false);
  const start = async () => {
    setFailed(false);
    // one quiet retry after a pause, then show the failure instead of leaving a dead box
    const libs = await loadMath()
      .catch(() => new Promise((r) => setTimeout(r, 500)).then(loadMath))
      .catch(() => undefined);
    if (dead) return;
    if (!libs) return setFailed(true);
    const { mq, compile } = libs;
    setReady(true);
    field = mq.MathField(host, {
      autoCommands: `${GREEK} sqrt sum prod int nthroot`,
      autoOperatorNames: FUNCS,
      sumStartsWithNEquals: true,
      handlers: {
        edit: (f) => {
          setTex(ctx.p, f.latex());
          setBad(!setMath(compile, ctx.p, f.latex()));
          ctx.redraw();
        },
      },
    });
    field.latex(initial);
  };
  onMount(start);
  onCleanup(() => {
    dead = true;
    field?.revert();
    dropMath(ctx.p);
  });

  return (
    <div class={css.body}>
      <Head />
      <div
        class={css.field}
        classList={{ [css.bad]: bad() }}
        on:pointerdown={(e) => e.stopPropagation()}
        on:keydown={(e) => e.stopPropagation()}
      >
        <span ref={host} />
        <Show when={!ready()}>
          <Show
            when={failed()}
            fallback={
              <div class={css.load} title="Loading the math editor">
                <i style={{ width: `${load() * 100}%` }} />
              </div>
            }
          >
            <button class={css.retry} onClick={start}>
              Couldn't load the math editor. Click to retry
            </button>
          </Show>
        </Show>
      </div>
      <Scope style={{ flex: "none", height: "64px", "box-sizing": "border-box" }} />
      {["p", "q", "r"].map((n, j) => (
        <i class={css.in} style={{ top: `calc(${25 * (j + 1)}% + ${j + 1}px)` }}>
          {n}
        </i>
      ))}
      <div class={knobCss.row}>
        <Knob j={0} class={knobCss.tall} />
        <Knob j={1} class={knobCss.tall} />
        <Knob j={2} class={knobCss.tall} />
        <Knob j={3} class={knobCss.tall} />
      </div>
      <Flags />
    </div>
  );
}
