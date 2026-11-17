import * as foo from './mod.js'

it('reexports a CommonJS module with `export *` from a module with side effects', () => {
  // The `export *` of a CommonJS module is reported as an issue (see `issues/`)
  // but still works at runtime.
  expect(foo.foo).toBe(1)
  expect(foo.bar).toBe(2)
  expect(globalThis.hoistTest).toBe(true)
})
