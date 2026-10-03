precision highp float;

in vec3 pos;
in float h;
uniform bool uLive;
out vec4 o;

const vec3 BASE = vec3(0.62, 0.68, 0.78);
const vec3 HIGH = vec3(0.47, 0.73, 1.0); // --accent-200

void main() {
  if (uLive) {
    o = vec4(1.0, 0.6, 0.25, 1.0); // one flat colour, same orange as the scope overlay
    return;
  }
  // Flat shading from screen-space derivatives of the world position.
  vec3 n = normalize(cross(dFdx(pos), dFdy(pos)));
  float light = 0.35 + 0.65 * abs(dot(n, normalize(vec3(-0.4, 1.0, -0.3))));
  vec3 c = (h > 0.0 ? HIGH : BASE) * light * (0.4 + 0.6 * abs(h));
  o = vec4(c, 1.0);
}
