precision highp float;

in vec2 vP;

flat in vec4 vSeg;
flat in vec2 vV;
flat in float vR;

uniform vec3 uCol;

out vec4 o;

void main() {
  vec2 a = vSeg.xy, ba = vSeg.zw - a, pa = vP - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h) - vR;
  float k = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  if (k == 0.0) discard;
  vec3 col = abs(h < 0.5 ? vV.x : vV.y) > 1.0 ? vec3(1.0, 0.25, 0.25) : uCol;
  o = vec4(col * k, k);
}
