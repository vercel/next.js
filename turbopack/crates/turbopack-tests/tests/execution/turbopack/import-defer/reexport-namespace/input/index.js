import { log } from './log.js'
import { ns, renamed } from './reexporter.js'
import defaultNs from './reexporter-default.js'
import { lazyNs } from './side-effect-free/barrel.js'
import { asyncNs } from './reexporter-async.js'

it('should keep a re-exported deferred namespace deferred', () => {
  expect(log).not.toContain('target')
  expect(ns.then).toBeUndefined()
  expect(log).not.toContain('target')
  expect(ns.value).toBe('target-value')
  expect(log).toContain('target')
})

it('should share the deferred namespace between the re-exports', () => {
  expect(renamed).toBe(ns)
  expect(renamed.value).toBe('target-value')
  expect(log.filter((x) => x === 'target')).toEqual(['target'])
})

it('should keep a deferred namespace re-exported as default deferred', () => {
  expect(log).not.toContain('default-target')
  expect(defaultNs.value).toBe('default-target-value')
  expect(log).toContain('default-target')
})

it('should keep a deferred namespace re-exported through a side effect free barrel deferred', () => {
  expect(log).not.toContain('barrel-target')
  expect(Object.keys(lazyNs)).toEqual(['value'])
  expect(log).not.toContain('barrel-target')
  expect(lazyNs.value).toBe('barrel-target-value')
  expect(log).toContain('barrel-target')
})

it('should evaluate a re-exported deferred namespace of an async module eagerly', () => {
  expect(log).toContain('async-target')
  expect(asyncNs.value).toBe('async-target-value')
})
