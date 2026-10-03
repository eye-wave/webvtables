precision highp float;
precision highp sampler2D;

// uTex is (columns x (frames + 1)); the last row is the live wave.
// Image: x = sample, y = frame, brightness = |height|.
in vec2 uv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uHead;
out vec4 o;

const vec3 BASE = vec3(0.62, 0.68, 0.78);
const vec3 HIGH = vec3(0.47, 0.73, 1.0); // --accent-200

void main() {
  ivec2 sz = textureSize(uTex, 0);
  float frames = float(sz.y - 1);
  // Playhead: a ~2px band that shows the live wave instead of the stored row.
  bool head = abs(uv.y - uHead / frames) * uRes.y < 1.0;
  int row = head ? sz.y - 1 : min(int(uv.y * frames), sz.y - 2);
  int col = min(int(uv.x * float(sz.x)), sz.x - 1);
  float h = clamp(texelFetch(uTex, ivec2(col, row), 0).r, -1.0, 1.0);

  float a = head ? 0.4 + 0.6 * abs(h) : 0.8 * abs(h);
  o = vec4((head || h > 0.0 ? HIGH : BASE) * a, a);
}
