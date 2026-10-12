precision highp float;

in vec2 vP;
flat in vec4 vC;

uniform vec4 uClip;

out vec4 o;

void main() {
  if (vP.x < uClip.x || vP.y < uClip.y || vP.x > uClip.x + uClip.z || vP.y > uClip.y + uClip.w) discard;
  o = vec4(vC.rgb * vC.a, vC.a);
}
