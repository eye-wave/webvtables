#version 300 es

layout(location = 0) in vec2 aPos;

uniform vec2 uResolution;
uniform float uZ;

void main() {
  vec2 clip = (aPos / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, uZ, 1.0);
}
