#version 300 es

layout(location = 0) in vec2 aPos;

uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform float uZ;

out vec2 vUv;

void main() {
  vUv = aPos + 0.5;
  vec2 world = uCenter + aPos * uSize;
  vec2 clip = (world / uResolution) * 2.0 - 1.0;

  gl_Position = vec4(clip.x, -clip.y, uZ, 1.0);
}
