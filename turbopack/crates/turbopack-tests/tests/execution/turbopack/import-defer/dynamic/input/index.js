import { log } from './log.js'

it('should load but not evaluate a module with import.defer()', async () => {
  // prettier-ignore
  const ns = await import.defer('./lazy.js')
  expect(log).toEqual([])
  expect(ns.then).toBeUndefined()
  expect(ns.value).toBe('lazy-dep')
  expect(log).toEqual(['dep', 'lazy'])
  expect(ns.value).toBe('lazy-dep')
  expect(log).toEqual(['dep', 'lazy'])
})

it('should return a namespace usable after a regular import()', async () => {
  // prettier-ignore
  const deferred = await import.defer('./other.js')
  expect(log).toEqual(['dep', 'lazy'])
  const eager = await import('./other.js')
  expect(log).toEqual(['dep', 'lazy', 'other'])
  expect(deferred.other).toBe('other')
  expect(eager.other).toBe('other')
  expect(log).toEqual(['dep', 'lazy', 'other'])
})

it('should support default exports', async () => {
  // prettier-ignore
  const ns = await import.defer('./with-default.js')
  expect(log).not.toContain('with-default')
  expect(ns.default).toBe('the-default')
  expect(log).toContain('with-default')
})
