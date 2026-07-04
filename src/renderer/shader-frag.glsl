#version 300 es

precision highp float;

in vec3 vColor;
in vec2 vLocal;
in float vShape;

out vec4 fragColor;

void main() {
  if (vShape > 0.5 && length(vLocal) > 0.5) discard;
  fragColor = vec4(vColor, 1.0);
}
