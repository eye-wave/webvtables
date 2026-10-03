// Mesh: one quad per (column, frame) cell, generated from gl_VertexID, no buffers.
// uLive: a 2px ribbon of the live wave (last texture row) laid at the playhead.
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uHead;
uniform bool uLive;
out vec3 pos;
out float h;

const vec2 CORNER[6] = vec2[](vec2(0, 0), vec2(1, 0), vec2(0, 1), vec2(0, 1), vec2(1, 0), vec2(1, 1));
// Fitted so the whole mesh (peaks included) fits the 280x160 widget: ~96% of its height.
const float YAW = 0.5, PITCH = 0.6, SCALE = 0.88, AMP = 0.4;

void main() {
  ivec2 sz = textureSize(uTex, 0);
  int cols = sz.x - 1, rows = sz.y - 2; // quads; the last texture row is the live wave
  ivec2 c;
  float z;
  if (uLive) {
    c = ivec2(gl_VertexID / 2, sz.y - 1);
    z = clamp(uHead / float(rows), 0.0, 1.0) * 2.0 - 1.0;
  } else {
    int q = gl_VertexID / 6;
    c = ivec2(q % cols, q / cols) + ivec2(CORNER[gl_VertexID % 6]);
    z = float(c.y) / float(rows) * 2.0 - 1.0;
  }
  h = clamp(texelFetch(uTex, c, 0).r, -1.0, 1.0);
  vec3 p = vec3(float(c.x) / float(cols) * 2.0 - 1.0, h * AMP, z);
  pos = p;
  p.xz = mat2(cos(YAW), sin(YAW), -sin(YAW), cos(YAW)) * p.xz;
  p.yz = vec2(p.y * cos(PITCH) + p.z * sin(PITCH), p.z * cos(PITCH) - p.y * sin(PITCH));
  gl_Position = vec4(p.x * SCALE * uRes.y / uRes.x, p.y * SCALE, p.z * 0.4, 1.0);
  if (uLive) gl_Position.y += float(gl_VertexID & 1) * 6.0 / uRes.y;
}
