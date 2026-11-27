import { log } from './log.js'
// prettier-ignore
import defer * as esm from './esm.js'

function identity(x) {
  return x
}

it('should pass a deferred namespace as value without evaluating it', () => {
  const ns = identity(esm)
  expect(log).toEqual([])
  expect(ns.then).toBeUndefined()
  expect(log).toEqual([])
  // Known exports: keys are available without evaluation (accepted deviation).
  expect(Object.keys(ns).sort()).toEqual(['default', 'x', 'y'])
  expect(log).toEqual([])
})

it('should evaluate on access through the namespace value', () => {
  const ns = identity(esm)
  expect(ns.x).toBe(1)
  expect(log).toEqual(['esm'])
  expect(ns.y()).toBe(2)
  expect(ns.default).toBe('esm-default')
  expect(log).toEqual(['esm'])
})

it('should return the same namespace value', () => {
  expect(identity(esm)).toBe(identity(esm))
})
