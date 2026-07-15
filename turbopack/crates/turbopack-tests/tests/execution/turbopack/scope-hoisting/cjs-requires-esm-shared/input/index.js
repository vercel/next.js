const { value } = require('./esm')
const lib = require('./lib')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it — which would
// also put `./esm` in a different group from `./lib` and defeat the sharing case.
exports.value = value

it('shares one inlined ESM module across two CJS requirers', () => {
  expect(value).toBe(42)
  expect(lib.libValue).toBe(42)
  expect(lib.libDoubled).toBe(84)
  expect(globalThis.__sharedEsmEvals).toBe(1)
})
