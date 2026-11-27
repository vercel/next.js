import { log } from './log.js'
// prettier-ignore
import defer * as cjs from './cjs.js'
// prettier-ignore
import defer * as reexportCjs from './reexport-cjs.js'
// prettier-ignore
import defer * as cjsAsValue from './cjs-as-value.js'

function identity(x) {
  return x
}

it('should defer a CommonJS module', () => {
  expect(log).toEqual([])
  expect(cjs.named).toBe('named')
  expect(log).toEqual(['cjs'])
  expect(cjs.default).toEqual({ named: 'named', other: 'other' })
})

it('should defer an ESM module re-exporting CommonJS', () => {
  expect(log).not.toContain('reexported-cjs')
  expect(reexportCjs.fromCjs).toBe('from-cjs')
  expect(log).toContain('reexported-cjs')
  expect(log).toContain('reexport-cjs')
  expect(reexportCjs.own).toBe('own')
})

it('should create a Proxy namespace for unknown exports', () => {
  const ns = identity(cjsAsValue)
  expect(log).not.toContain('cjs-as-value')
  expect(ns.then).toBeUndefined()
  expect(log).not.toContain('cjs-as-value')
  expect('dynamicKey' in ns).toBe(true)
  expect(log).toContain('cjs-as-value')
  expect(ns.dynamicKey).toBe('dynamic')
  expect(Object.keys(ns)).toContain('dynamicKey')
})

it('should defer import.defer() of a CommonJS module', async () => {
  // prettier-ignore
  const ns = await import.defer('./cjs-dynamic.js')
  expect(log).not.toContain('cjs-dynamic')
  expect(ns.value).toBe(42)
  expect(log).toContain('cjs-dynamic')
})
