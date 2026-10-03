layout(location = 0) in vec2 aC;

uniform vec2 uRes;
uniform vec3 uView;
uniform float uR;

out vec2 vP;

flat out vec2 vC;

void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float m = uR + 3.0 + 1.5 / uView.z;
  vec2 p = aC + (c * 2.0 - 1.0) * m;
  vP = p;
  vC = aC;

  vec2 s = p * uView.z + uView.xy;

  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, -0.9999, 1.0);
}
