#version 300 es

precision highp float;

in vec3 vColor;
in vec2 vLocal;
in float vShape;
in vec2 vSize;
in float vRingWidth;
in vec2 vAngles;

out vec4 fragColor;

const float TWO_PI = 6.28318530718;

void main() {
  if (vShape > 0.5 && vShape < 1.5 && length(vLocal) > 0.5) discard;

  if (vShape > 1.5) {
    float outerR = vSize.x * 0.5;
    float worldR = length(vLocal) * vSize.x;
    if (worldR > outerR || worldR < outerR - vRingWidth) discard;

    float ang = atan(vLocal.y, vLocal.x);
    float span = vAngles.y - vAngles.x;
    float delta = mod(ang - vAngles.x, TWO_PI);
    if (delta > span) discard;
  }

  fragColor = vec4(vColor, 1.0);
}
