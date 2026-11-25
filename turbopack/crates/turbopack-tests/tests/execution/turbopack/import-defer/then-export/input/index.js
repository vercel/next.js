import { log } from './log.js'
import defer * as thenable from './thenable.js'

it('should hide a `then` export of a deferred namespace without evaluating it', () => {
  expect(thenable.then).toBeUndefined()
  expect(log).toEqual([])
  expect(thenable.value).toBe('value')
  expect(log).toEqual(['thenable'])
  expect(thenable.then).toBeUndefined()
})

it('should not expose `then` on a deferred namespace used as value', async () => {
  const ns = [thenable][0]
  expect(ns.then).toBeUndefined()
  expect('then' in ns).toBe(false)
})

it('should resolve import.defer() of a module with a `then` export to the deferred namespace', async () => {
  const ns = await import.defer('./thenable-dynamic.js')
  expect(log).not.toContain('thenable-dynamic')
  expect(ns.then).toBeUndefined()
  // Known exports: getters, enumerable without evaluation (accepted deviation)
  expect(Object.keys(ns).sort()).toEqual(['value'])
  expect(log).not.toContain('thenable-dynamic')
  expect(ns.value).toBe('dynamic-value')
  expect(log).toContain('thenable-dynamic')
})
