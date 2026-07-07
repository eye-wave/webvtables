const math_ffi: Record<string, Math[keyof Math]> = {
  ln: Math.log,
};

for (const name of [
  "atan2",
  "cos",
  "exp",
  "floor",
  "log2",
  "log10",
  "max",
  "pow",
  "round",
  "sin",
  "sqrt",
  "tanh",
] as const) {
  math_ffi[name] = Math[name];
}

for (const [name, fn] of Object.entries(math_ffi)) {
  math_ffi[name + "f"] = fn;
}

export { math_ffi };
