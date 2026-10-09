import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  dropMath,
  loadMath,
  onMathProgress,
  setMath,
  type MathField,
} from "./math";
import { Flags, Head, Knob, Scope, useNode } from "./node";
import knobCss from "./knob.module.css";
import css from "./math_ui.module.css";

const GREEK =
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega";
const FUNCS =
  "sin cos tan csc sec cot arcsin arccos arctan arccsc arcsec arccot sinh cosh tanh csch sech coth ln log exp abs sign floor ceil round mod gcd lcm min max mean median total length";

export function MathView() {
  const ctx = useNode();
  const [bad, setBad] = createSignal(false);
  const [load, setLoad] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  onCleanup(onMathProgress(setLoad));
  let host!: HTMLDivElement;
  let field: MathField | undefined;
  let dead = false;

  onMount(async () => {
    const libs = await loadMath().catch(() => undefined);
    if (!libs || dead) return;
    const { mq, compile } = libs;
    setReady(true);
    field = mq.MathField(host, {
      autoCommands: `${GREEK} sqrt sum prod int nthroot`,
      autoOperatorNames: FUNCS,
      sumStartsWithNEquals: true,
      handlers: {
        edit: (f) => {
          setBad(!setMath(compile, ctx.p, f.latex()));
          ctx.redraw();
        },
      },
    });
    field.latex("\\sin\\left(2\\pi x\\right)");
  });
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
          <div class={css.load} title="Loading the math editor">
            <i style={{ width: `${load() * 100}%` }} />
          </div>
        </Show>
      </div>
      <Scope />
      {["p", "q", "r"].map((n, j) => (
        <i
          class={css.in}
          style={{ top: `calc(${25 * (j + 1)}% + ${j + 1}px)` }}
        >
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
