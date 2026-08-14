import { value, greet } from './cjs'
import * as ns from './cjs'
import def from './cjs'

it('scope-hoists a named import from a static CJS module', () => {
  expect(value).toBe(42)
  expect(greet('world')).toBe('hi world')
})

it('reads namespace members and __esModule of a CJS module', () => {
  expect(ns.value).toBe(42)
  expect(ns.greet('world')).toBe('hi world')
  expect(ns.__esModule).toBe(true)
})

it('default import gets the CJS exports (interop)', () => {
  expect(def.value).toBe(42)
  expect(def.greet('world')).toBe('hi world')
})
