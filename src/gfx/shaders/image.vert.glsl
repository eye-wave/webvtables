uniform vec2 uRes;
uniform vec3 uView;
uniform vec4 uClip;
uniform float uZ;

out vec2 vP;

void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 p = uClip.xy + c * uClip.zw;
  vP = p;
  vec2 s = p * uView.z + uView.xy;
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, uZ, 1.0);
}
