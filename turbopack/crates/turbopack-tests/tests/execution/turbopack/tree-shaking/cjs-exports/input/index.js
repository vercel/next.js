import { pick } from './other'

it('should require a split CommonJS module and get the full exports object', () => {
  const lib = require('./lib')
  expect(lib.used).toBe('used-value')
  expect(lib.unused).toBe('unused-value')
  expect(lib.impure).toBe('impure')
  expect(lib.__esModule).toBeUndefined()
  // module.exports must stay a plain mutable object (not sealed)
  lib.added = 'added'
  expect(lib.added).toBe('added')
  delete lib.added
})

it('should preserve evaluation order of interleaved side effects', () => {
  const lib = require('./lib')
  expect(lib.order).toEqual(['start', 'impure', 'end'])
})

it('should support namespace imports of a split CommonJS module', async () => {
  const ns = await import('./lib')
  expect(ns.used).toBe('used-value')
  expect(ns.unused).toBe('unused-value')
})

it('should support named imports from a split CommonJS module', () => {
  expect(pick).toBe('picked')
})
