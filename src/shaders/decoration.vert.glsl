layout(location = 0) in vec4 aRect;
layout(location = 1) in vec2 aMeta;

uniform vec2 uRes;
uniform float uN, uPad;

out vec2 vP;

flat out vec4 vRect;
flat out float vKind;

void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 p = aRect.xy - uPad + c * (aRect.zw + 2.0 * uPad);
  vP = p;
  vRect = aRect;
  vKind = aMeta.y;

  float z = 1.0 - 2.0 * (aMeta.x + 1.0) / (uN + 1.0);
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, z, 1.0);
}
