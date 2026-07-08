#version 300 es
precision mediump float;

in vec2 vUv;

uniform sampler2D uSampler;

out vec4 fragColor;

void main() {
  fragColor = texture(uSampler, vUv);
}
