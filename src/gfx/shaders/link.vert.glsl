layout(location = 0) in vec4 aSeg;
layout(location = 1) in float aHot;

uniform vec2 uRes;
uniform vec3 uView;
uniform float uR;

out vec2 vP;

flat out vec4 vSeg;
flat out float vHot;

void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float m = 2.0 * uR + 1.5 / uView.z;
  vec2 p = mix(min(aSeg.xy, aSeg.zw) - m, max(aSeg.xy, aSeg.zw) + m, c);
  vP = p;
  vSeg = aSeg;
  vHot = aHot;

  vec2 s = p * uView.z + uView.xy;

  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.9999, 1.0);
}
