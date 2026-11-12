import { FOO as FOO_SINGLE } from './single.js'
import { FOO as FOO_MULTIPLE } from './multiple-1.js'

it('does not hang on exports that reference each other in a cycle', () => {
  // Calling these would recurse infinitely, the build must not.
  expect(typeof FOO_SINGLE).toBe('function')
  expect(typeof FOO_MULTIPLE).toBe('function')
  expect(FOO_SINGLE).not.toBe(FOO_MULTIPLE)
  expect(FOO_SINGLE.toString()).not.toContain('TURBOPACK compile-time')
  expect(FOO_MULTIPLE.toString()).not.toContain('TURBOPACK compile-time')
})
