#version 300 es

layout(location = 0) in vec2 aPos;

uniform vec2 uResolution;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform float uZ;
uniform float uLineWidth;
uniform sampler2D uSamples;
uniform int uCount;

out float vClipped;

void main() {
  int i = gl_InstanceID;
  float s1 = texelFetch(uSamples, ivec2(i, 0), 0).r;
  float s2 = texelFetch(uSamples, ivec2(i + 1, 0), 0).r;

  float step = uSize.x / float(uCount - 1);
  float mid = uOrigin.y + uSize.y * 0.5;
  float scale = uSize.y * 0.5;
  float minY = uOrigin.y;
  float maxY = uOrigin.y + uSize.y;

  float x1 = uOrigin.x + float(i) * step;
  float x2 = uOrigin.x + float(i + 1) * step;
  float y1 = clamp(mid - s1 * scale, minY, maxY);
  float y2 = clamp(mid - s2 * scale, minY, maxY);

  vec2 center = vec2((x1 + x2) * 0.5, (y1 + y2) * 0.5);
  float dx = x2 - x1;
  float dy = y2 - y1;
  float len = max(length(vec2(dx, dy)), 0.0001);
  float rot = atan(dy, dx);

  vec2 p = aPos * vec2(len, uLineWidth);
  float c = cos(rot);
  float s = sin(rot);
  vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 pos = center + rotated;
  vec2 clip = (pos / uResolution) * 2.0 - 1.0;

  gl_Position = vec4(clip.x, -clip.y, uZ, 1.0);

  vClipped = (abs(s1) > 1.0 || abs(s2) > 1.0) ? 1.0 : 0.0;
}
