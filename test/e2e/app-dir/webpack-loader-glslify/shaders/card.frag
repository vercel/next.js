precision mediump float;

#pragma glslify: color = require('./color.glsl')

void main() {
  gl_FragColor = color();
}
