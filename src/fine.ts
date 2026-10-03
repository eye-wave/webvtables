export const fineScale = (e: { altKey: boolean; shiftKey: boolean }) =>
  e.altKey || e.shiftKey ? 0.05 : 1;
