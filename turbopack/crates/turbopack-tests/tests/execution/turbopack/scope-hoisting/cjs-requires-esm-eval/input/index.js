require('./esm')

// This module needs a statically analyzable CommonJS export of its own, otherwise
// it is not mergeable and no scope-hoisting group forms around it.
exports.ran = true

it('runs an ESM module required only for its side effect', () => {
  expect(globalThis.__esmEvalSideEffect).toBe(1)
})
