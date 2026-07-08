#version 300 es

layout(location = 0) in vec2 aPos;

uniform vec2 uResolution;
uniform vec4 uBase;
uniform vec2 uStep;
uniform float uLineWidth;
uniform vec3 uColor;
uniform float uZ;

out vec3 vColor;

void main() {
  vec2 offset = uStep * float(gl_InstanceID);
  vec2 p1 = uBase.xy + offset;
  vec2 p2 = uBase.zw + offset;

  vec2 center = (p1 + p2) * 0.5;
  float dx = p2.x - p1.x;
  float dy = p2.y - p1.y;
  float len = length(vec2(dx, dy));
  float rot = atan(dy, dx);

  vec2 p = aPos * vec2(len, uLineWidth);
  float c = cos(rot);
  float s = sin(rot);
  vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 pos = center + rotated;
  vec2 clip = (pos / uResolution) * 2.0 - 1.0;

  gl_Position = vec4(clip.x, -clip.y, uZ, 1.0);
  vColor = uColor;
}
