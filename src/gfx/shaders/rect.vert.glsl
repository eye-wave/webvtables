layout(location = 0) in vec4 aR; // x y w h
layout(location = 1) in vec4 aC; // r g b a

uniform vec2 uRes;
uniform vec3 uView;
uniform float uZ;

out vec2 vP;
flat out vec4 vC;

void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 p = aR.xy + c * max(aR.zw, vec2(1.0 / uView.z)); // never thinner than a screen pixel
  vP = p;
  vC = aC;
  vec2 s = p * uView.z + uView.xy;
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, uZ, 1.0);
}
