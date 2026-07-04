#version 300 es

layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aCenter;
layout(location = 2) in vec2 aSize;
layout(location = 3) in float aRot;
layout(location = 4) in vec3 aColor;
layout(location = 5) in float aZ;
layout(location = 6) in float aShape;

uniform vec2 uResolution;

out vec3 vColor;
out vec2 vLocal;
out float vShape;

void main() {
  vec2 p = aPos * aSize;

  float c = cos(aRot);
  float s = sin(aRot);

  vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 pos = aCenter + rotated;
  vec2 clip = (pos / uResolution) * 2.0 - 1.0;

  gl_Position = vec4(clip.x, -clip.y, aZ, 1.0);

  vColor = aColor;
  vLocal = aPos;
  vShape = aShape;
}
