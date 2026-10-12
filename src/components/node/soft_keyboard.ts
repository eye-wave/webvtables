import type { MathField } from "./math";

// MathQuill relies on `keypress`, which mobile IMEs don't fire.
// On `input` without a prior `keypress`, insert the textarea's text character by character..
export function softKeyboard(field: MathField, ta: HTMLTextAreaElement) {
  let keyed = false;
  let sent = 0;
  const reset = () => ((ta.value = ""), (sent = 0));

  ta.addEventListener("keydown", () => (keyed = false));
  ta.addEventListener("keypress", () => (keyed = true));
  ta.addEventListener("input", (e) => {
    if (keyed) return void (keyed = false);
    const n = ta.value.length;
    if (n > sent) field.typedText(ta.value.slice(sent));
    else for (let i = n; i < sent; i++) field.keystroke("Backspace");
    sent = n;
    if (!(e as InputEvent).isComposing) reset();
  });
  ta.addEventListener("compositionend", reset);
}
