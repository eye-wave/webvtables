/** Shared pan/zoom state. Both renderers read this to place world-space
 * draw commands on screen; input handling reads/writes it directly. */
export const camera = { x: 0, y: 0, zoom: 1 };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export function toWorld(screenX: number, screenY: number): [number, number] {
  return [(screenX - camera.x) / camera.zoom, (screenY - camera.y) / camera.zoom];
}

/** Zoom in/out by `deltaY` (wheel units) while keeping the world point under
 * (screenX, screenY) fixed on screen. */
export function zoomAt(screenX: number, screenY: number, deltaY: number) {
  const [wx, wy] = toWorld(screenX, screenY);
  const newZoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, camera.zoom * Math.exp(-deltaY * 0.01)),
  );
  camera.x -= wx * (newZoom - camera.zoom);
  camera.y -= wy * (newZoom - camera.zoom);
  camera.zoom = newZoom;
}

export function pan(dx: number, dy: number) {
  camera.x -= dx;
  camera.y -= dy;
}

/** Direct drag-to-pan: the canvas follows the cursor 1:1 (opposite sign
 * convention from wheel-scroll's `pan`, which mimics natural scrolling). */
export function panByDrag(dx: number, dy: number) {
  camera.x += dx;
  camera.y += dy;
}
