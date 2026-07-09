import { a as importedA } from './lib'

it('should require a split `module.exports = { ... }` object literal', () => {
  const lib = require('./lib')
  expect(lib.a).toBe('a-value')
  expect(lib.b).toBe('b-value')
  expect(lib.c).toBe('c-value')
  expect(lib.d).toBe('d-value')
  expect(typeof lib.greet).toBe('function')
  expect(lib.greet()).toBe('hello')
  expect(lib.__esModule).toBeUndefined()
  // module.exports must stay a plain mutable object (not sealed)
  lib.added = 'added'
  expect(lib.added).toBe('added')
  delete lib.added
})

it('should support a named import from an object-literal module', () => {
  expect(importedA).toBe('a-value')
})

it('should support namespace imports of an object-literal module', async () => {
  const ns = await import('./lib')
  expect(ns.a).toBe('a-value')
  expect(ns.c).toBe('c-value')
  expect(ns.greet()).toBe('hello')
})
