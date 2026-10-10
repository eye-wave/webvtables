precision highp float;

uniform float uPad, uR;

in vec2 vP;

flat in vec4 vRect;
flat in float vKind;

out vec4 o;

void main() {
  o = vec4(0.0); // the depth-only pass (uPad == 0) must not leave the output undefined: some mobile drivers ignore colorMask and write garbage (white)
  vec2 h = vRect.zw * 0.5;
  vec2 q = abs(vP - vRect.xy - h) - h + uR;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uR;
  if (uPad == 0.0) {
    if (d > 0.0) discard;
    return;
  }
  if (d < 0.0 || d > uPad) discard;
  float a = pow(1.0 - d / uPad, 2.0) * 0.55 + (1.0 - smoothstep(1.0, 2.0, d)) * 0.45;
  vec3 col = vKind == 0.0 ? vec3(0.3, 0.6, 1.0) : vKind == 1.0 ? vec3(1.0, 0.6, 0.25) : vec3(0.4, 0.9, 0.5);
  o = vec4(col * a, a);
}
