import { createRequire } from 'node:module'

it('createRequire with import.meta.url works', () => {
  const require = createRequire(import.meta.url)
  const foo = require('./sub/foo.js')
  expect(foo).toBe('foo')
})

it('createRequire with URL works', () => {
  // Currently (incorrectly) emits an error about `Module not found: Can't resolve './sub/'`
  const require = createRequire(new URL('./sub/', import.meta.url))
  const foo = require('./foo.js')
  expect(foo).toBe('foo')
})
