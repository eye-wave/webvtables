// Math node runtime. MathQuill (input), jQuery (its dependency) and the compute engine (LaTeX -> JS)
// load on the first Math node mount, never before. wasm calls `mathEval` once per buffer: the LaTeX
// becomes one generated JS loop over all samples, x in [0,1), knobs a..d, the inputs' samples p q r.
type Batch = (
  p: Float32Array,
  q: Float32Array,
  r: Float32Array,
  out: Float32Array,
  a: number,
  b: number,
  c: number,
  d: number,
) => void;

// keyed by the node's address in wasm memory (what the Rust side passes as `node`)
const fns = new Map<number, Batch>();

// Bumped whenever a formula changes; the heightmap preview compares it to know when to re-render.
let rev = 0;
export const mathRev = () => rev;

// The LaTeX of each Math node (by node address), what a saved project stores as the node's asset.
const texs = new Map<number, string>();
export const DEFAULT_TEX = "\\sin\\left(2\\pi x\\right)";
export const texOf = (addr: number) => texs.get(addr);
export const setTex = (addr: number, tex: string) => void texs.set(addr, tex);
/** LaTeX read from a project file, by node index; the view takes it when it mounts. */
export const texBoot = new Map<number, string>();

/** The wasm import `math_eval`: pointers are f32 offsets into `mem`. No function yet leaves `out` as is. */
export const mathEval = (
  mem: WebAssembly.Memory,
  node: number,
  a: number,
  b: number,
  c: number,
  d: number,
  p: number,
  q: number,
  r: number,
  out: number,
  len: number,
) => {
  const f = fns.get(node);
  if (!f) return;
  const m = new Float32Array(mem.buffer);
  const at = (o: number) => m.subarray(o >> 2, (o >> 2) + len);
  f(at(p), at(q), at(r), at(out), a, b, c, d);
};

export type MathField = {
  latex(): string;
  latex(l: string): void;
  focus(): void;
  revert(): void;
};
type MQ = {
  MathField(
    el: HTMLElement,
    cfg: {
      autoCommands?: string;
      autoOperatorNames?: string;
      sumStartsWithNEquals?: boolean;
      handlers?: { edit?: (f: MathField) => void };
    },
  ): MathField;
};

type Libs = {
  mq: MQ;
  /** LaTeX -> batch function, or undefined when it doesn't compile to a number. */
  compile: (tex: string) => Batch | undefined;
};
let libs: Promise<Libs> | undefined;

// Load progress 0..1, weighted by rough download size (the compute engine is most of it).
let frac = 0;
const subs = new Set<(f: number) => void>();
const bump = (w: number) => {
  frac = Math.min(1, frac + w);
  subs.forEach((f) => f(frac));
};
/** Calls `f` with the current progress now and on every step; returns the unsubscribe. */
export const onMathProgress = (f: (frac: number) => void) => {
  f(frac);
  subs.add(f);
  return () => void subs.delete(f);
};

// A failed load is not cached: the next call tries again (a dev-server hiccup shouldn't kill every Math node).
export const loadMath = () =>
  (libs ??= (async () => {
    const step = <T>(w: number, p: Promise<T>) => p.then((v) => (bump(w), v));
    const [, , lib] = await Promise.all([
      step(
        0.1,
        import("jquery").then(async ({ default: jq }) => {
          (window as any).jQuery = jq; // MathQuill reads it when it evaluates
          return import("mathquill/build/mathquill.js?raw").then(
            ({ default: src }) =>
              // MathQuill 0.10.1 bug: Ctrl+Backspace at the start of a block (or over a selection) calls an
              // undefined `ctrlr` and throws. Evaluating the source ourselves lets us fix that one line.
              new Function(
                src.replace(
                  "return ctrlr.deleteDir();",
                  "return this.deleteDir(dir);",
                ),
              )(),
          );
        }),
      ),
      step(0.05, import("mathquill/build/mathquill.css")),
      step(
        0.85,
        Promise.all([
          import("@cortex-js/compute-engine"),
          import("@cortex-js/compute-engine/runtime"),
        ]),
      ),
    ]);
    // MathQuill's Symbola web font (340 KB+) makes Firefox log "glyph bbox was incorrect" for every load;
    // drop its @font-face before any text uses it, the CSS lists Times New Roman / serif behind it.
    for (const sheet of document.styleSheets)
      try {
        for (let i = sheet.cssRules.length; i--;) {
          const rule = sheet.cssRules[i];
          if (
            rule instanceof CSSFontFaceRule &&
            rule.style.fontFamily.includes("Symbola")
          )
            sheet.deleteRule(i);
        }
      } catch {} // cross-origin sheets can't be read
    const [{ compile }, { createJavaScriptRuntime }] = lib;
    const rt = createJavaScriptRuntime();
    return {
      mq: (window as any).MathQuill.getInterface(2) as MQ,
      compile: (tex: string) => {
        const r = compile(tex);
        if (!r.success) return;
        // the generated code reads variables as `_.name`; helpers (`_SYS`) exist only inside rt.load
        const call = r.calling === "lambda" ? `(${r.code})()` : r.code;
        const src = `(function(P,Q,R,O,a,b,c,d){const _={a,b,c,d,x:0,p:0,q:0,r:0},N=O.length;
for(let i=0;i<N;i++){_.x=i/N;_.p=P[i];_.q=Q[i];_.r=R[i];${(r as { preamble?: string }).preamble ?? ""}
const y=${call};
O[i]=typeof y==="number"?(y-y===0?y:0):y&&y.im===0?y.re:0}})`; // complex results: real part if purely real
        return rt.load({
          code: src,
          calling: "expression",
          runtimeVersion: r.runtimeVersion,
          reconstructionDigits: r.reconstructionDigits,
        })() as Batch;
      },
    };
  })().catch((e) => {
    libs = undefined;
    frac = 0;
    subs.forEach((f) => f(0));
    throw e;
  }));

// The compute engine reports bad input through console.warn/error; run its calls with them muted.
const LEVELS = ["log", "info", "warn", "error", "debug"] as const;
function quiet<T>(f: () => T): T {
  const keep = LEVELS.map((l) => console[l]);
  LEVELS.forEach((l) => (console[l] = () => {}));
  try {
    return f();
  } finally {
    LEVELS.forEach((l, i) => (console[l] = keep[i]));
  }
}

/** Compiles `tex` for the node at `addr`. Returns false (keeping the old function) if it can't. */
export function setMath(compile: Libs["compile"], addr: number, tex: string) {
  try {
    const f = quiet(() =>
      compile(tex.replace(/^\s*(y|f\\left\(x\\right\))\s*=/, "")),
    );
    if (f) (fns.set(addr, f), rev++);
    return !!f;
  } catch {
    return false;
  }
}

export const dropMath = (addr: number) => (
  texs.delete(addr),
  fns.delete(addr) && rev++
);
