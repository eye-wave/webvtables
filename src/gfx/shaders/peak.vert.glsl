layout(location = 0) in vec2 aPk; // min, max of one column

uniform vec2 uRes;
uniform vec3 uView;
uniform vec4 uRect;
uniform float uCount, uZ;

out vec2 vP;
flat out vec2 vY;

void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  float i = float(gl_InstanceID), px = 1.0 / uView.z;
  float x0 = uRect.x + uRect.z * i / uCount, x1 = uRect.x + uRect.z * (i + 1.0) / uCount;
  float top = uRect.y + uRect.w * (0.5 - 0.5 * clamp(aPk.y, -1.0, 1.0));
  float bot = uRect.y + uRect.w * (0.5 - 0.5 * clamp(aPk.x, -1.0, 1.0));
  float mid = 0.5 * (top + bot), m = max(0.5 * (bot - top), 0.5 * px); // at least one screen pixel
  top = mid - m;
  bot = mid + m;
  float e = 1.5 * px;
  vec2 p = vec2(mix(x0, x1, c.x), mix(top - e, bot + e, c.y));
  vP = p;
  vY = vec2(top, bot);
  vec2 s = p * uView.z + uView.xy;
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, uZ, 1.0);
}
