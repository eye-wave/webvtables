type Fn = (
  x: number,
  a: number,
  b: number,
  c: number,
  d: number,
  p: number,
  q: number,
  r: number,
) => number;

const fns = new Map<number, Fn>();

export const mathEval = (node: number, ...v: Parameters<Fn>) =>
  fns.get(node)?.(...v) ?? 0;

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

let libs: Promise<{
  mq: MQ;
  compile: typeof import("@cortex-js/compute-engine").compile;
}>;

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

export const loadMath = () =>
  (libs ??= (async () => {
    const step = <T>(w: number, p: Promise<T>) => p.then((v) => (bump(w), v));
    const [, , { compile }] = await Promise.all([
      step(
        0.1,
        import("jquery").then(({ default: jq }) => {
          (window as any).jQuery = jq;
          return import("mathquill/build/mathquill.js");
        }),
      ),
      step(0.05, import("mathquill/build/mathquill.css")),
      step(0.85, import("@cortex-js/compute-engine")),
    ]);

    // suppress firefox font warnings
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
      } catch {}

    return { mq: (window as any).MathQuill.getInterface(2) as MQ, compile };
  })());

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
export function setMath(
  compile: Awaited<typeof libs>["compile"],
  addr: number,
  tex: string,
) {
  try {
    const r = quiet(() =>
      compile(tex.replace(/^\s*(y|f\\left\(x\\right\))\s*=/, "")),
    );
    if (!r.success || !r.run) return false;
    const run = r.run as (v: Record<string, number>) => unknown;
    const v = { x: 0, a: 0, b: 0, c: 0, d: 0, p: 0, q: 0, r: 0 };
    fns.set(addr, (x, a, b, c, d, p, q, r) => {
      Object.assign(v, { x, a, b, c, d, p, q, r });
      try {
        const y = run(v);
        return typeof y === "number" ? y : NaN;
      } catch {
        return NaN;
      }
    });
    return true;
  } catch {
    return false;
  }
}

export const dropMath = (addr: number) => void fns.delete(addr);
