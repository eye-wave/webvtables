precision highp float;

uniform float uR;

in vec2 vP;

flat in vec4 vSeg;
flat in float vHot;

out vec4 o;

void main() {
  vec2 a = vSeg.xy, ba = vSeg.zw - a, pa = vP - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h) - uR * (1.0 + 0.6 * vHot);
  float k = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  if (k == 0.0) discard;
  o = vec4(mix(vec3(0.78, 0.82, 0.9), vec3(1.0, 0.82, 0.35), vHot) * k, k);
}
