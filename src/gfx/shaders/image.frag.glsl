precision highp float;

in vec2 vP;

uniform sampler2D uTex;
uniform vec4 uImg;
uniform vec4 uBox;
uniform vec3 uCol;

out vec4 o;

const float LINE = 0.75, HANDLE = 3.0, DIM = 0.45;

void main() {
  vec2 uv = (vP - uImg.xy) / uImg.zw;
  vec4 c = vec4(0.0);
  if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
    c = texture(uTex, uv);
    if (vP.x < uBox.x || vP.y < uBox.y || vP.x > uBox.z || vP.y > uBox.w) c *= DIM;
  }

  vec2 mid = (uBox.xy + uBox.zw) * 0.5, h = (uBox.zw - uBox.xy) * 0.5;
  vec2 q = abs(vP - mid) - h;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float w = max(fwidth(sd), 1e-4);
  float a = clamp(0.5 - (abs(sd) - LINE) / w, 0.0, 1.0);
  for (int i = 0; i < 9; i++) {
    if (i == 4) continue;
    vec2 hp = vec2(float(i % 3), float(i / 3)) * 0.5;
    vec2 d = abs(vP - mix(uBox.xy, uBox.zw, hp));
    float hd = max(d.x, d.y);
    a = max(a, clamp(0.5 - (hd - HANDLE) / w, 0.0, 1.0));
  }
  o = c * (1.0 - a) + vec4(uCol * a, a);
}
