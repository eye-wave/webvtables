precision highp float;

uniform float uR, uSpin;

in vec2 vP;

flat in vec2 vC;

out vec4 o;

const float N = 12.0;
const float TAU = 6.2831853;

void main() {
  vec2 q = vP - vC;
  float r = length(q);
  float cell = TAU / N;
  float ang = mod(atan(q.y, q.x) - uSpin, cell) - 0.5 * cell;
  float d = length(vec2(r - uR, r * ang)) - 1.5;
  float px = max(fwidth(r), 1e-4);
  float dots = clamp(0.5 - d / px, 0.0, 1.0);
  float fill = (1.0 - smoothstep(uR - 2.0, uR, r)) * 0.18;
  float a = max(dots, fill);
  o = vec4(vec3(0.4, 0.85, 1.0) * a, a);
}
