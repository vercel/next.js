// a.js
import * as B from './b'

it('reexports CommonJS exports through a chain of `export *`', () => {
  // The `export *` of a CommonJS module is reported as an issue (see `issues/`)
  // but still works at runtime.
  expect(B.hello).toBe('World')
})
