precision highp float;

in vec2 vP;
flat in vec2 vY;

uniform vec3 uCol;
uniform vec4 uClip;

out vec4 o;

void main() {
  if (vP.x < uClip.x || vP.y < uClip.y || vP.x > uClip.x + uClip.z || vP.y > uClip.y + uClip.w) discard;
  float d = max(vY.x - vP.y, vP.y - vY.y);
  float k = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
  if (k == 0.0) discard;
  o = vec4(uCol * k, k);
}
