layout(location = 0) in float aA;
layout(location = 1) in float aB;

uniform vec2 uRes;
uniform vec3 uView;
uniform vec4 uRect;
uniform float uCount, uZ;

const float THIN = 0.4, THICK = 1.0;

out vec2 vP;

flat out vec4 vSeg;
flat out vec2 vV;
flat out float vR;

void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float m = THICK / uView.z + 1.0 / uView.z;
  vec2 lo = uRect.xy + m, sz = uRect.zw - 2.0 * m;
  float i = float(gl_InstanceID), n = uCount - 1.0;
  vec2 a = lo + sz * vec2(i / n, 0.5 - 0.5 * clamp(aA, -1.0, 1.0));
  vec2 b = lo + sz * vec2((i + 1.0) / n, 0.5 - 0.5 * clamp(aB, -1.0, 1.0));
  vec2 sd = (b - a) * uView.z;
  float steep = smoothstep(4.0, 16.0, abs(sd.y) / max(abs(sd.x), 1e-4));
  float r = mix(THIN, THICK, steep) / uView.z;
  float e = r + 1.5 / uView.z;
  vec2 p = mix(min(a, b) - e, max(a, b) + e, c);
  vP = p;
  vSeg = vec4(a, b);
  vV = vec2(aA, aB);
  vR = r;

  vec2 s = p * uView.z + uView.xy;
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, uZ, 1.0);
}
