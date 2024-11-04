const { runtimePlatformArch } = require('./libvips');
const runtimePlatform = runtimePlatformArch();
console.log('runtimePlatform:', runtimePlatform);
const paths = [
  `../src/build/Release/sharp-${runtimePlatform}.node`,
  '../src/build/Release/sharp-wasm32.node',
  `@img/sharp-${runtimePlatform}/sharp.node`,
  '@img/sharp-wasm32/sharp.node'
];

let sharp;
const errors = [];
for (const path of paths) {
  try {
    sharp = require(path);
    break;
  } catch (err) {
    /* istanbul ignore next */
    errors.push(err);
  }
}
