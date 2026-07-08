#version 300 es

precision highp float;

in float vClipped;
out vec4 fragColor;

void main() {
  vec3 normalColor = vec3(120.0 / 255.0, 200.0 / 255.0, 255.0 / 255.0);
  vec3 clippedColor = vec3(1.0, 60.0 / 255.0, 60.0 / 255.0);

  fragColor = vec4(mix(normalColor, clippedColor, vClipped), 1.0);
}
