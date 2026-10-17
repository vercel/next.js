import { z } from './static-lib'
import { dynamicNamespace } from './dynamic-lib'
import { escapedNamespace } from './escape-lib'
import { direct as aliasA, direct as aliasB } from './direct-lib'
import defaultNamespace from './default-lib'
import { renamedNamespace } from './rename-barrel'
import { nestedNamespace } from './nested-lib'
import { asyncNamespace } from './async-lib'

it('reads multiple static members from a namespace-valued named export', () => {
  expect(z.object()).toBe('object')
  expect(z.string()).toBe('string')
  expect(z.value).toBe('value')
})

it('keeps the full namespace for dynamic computed access', () => {
  const read = (key) => dynamicNamespace[key]
  expect(read('first')).toBe('first')
  expect(read('second')).toBe('second')
})

it('keeps the full namespace when the binding escapes', () => {
  const consume = (namespace) => Object.keys(namespace).sort()
  expect(consume(escapedNamespace)).toEqual(['alpha', 'beta'])
})

it('joins static and opaque uses of the same namespace conservatively', () => {
  const key = 'unused'
  expect(z.object()).toBe('object')
  expect(z[key]).toBe('unused')
  expect(Object.keys(z)).toContain('unused')
})

it('supports direct export-star-as and static member expression variants', () => {
  expect(aliasA['value']).toBe('direct-value')
  expect(aliasA.value).toBe('direct-value')
  expect(aliasA?.value).toBe('direct-value')
  expect(aliasA.missing).toBe(undefined)
  expect(aliasA.method()).toBe('sibling-value')
})

it('preserves live bindings and disjoint members across local aliases', () => {
  expect(aliasA.live).toBe('before')
  aliasB.setLive('after')
  expect(aliasA.live).toBe('after')
  expect(aliasB.sibling).toBe('sibling-value')
  expect(globalThis.__namespace_value_side_effects).toBe(1)
})

it('supports default-exported and renamed namespace values', () => {
  expect(defaultNamespace.value).toBe('direct-value')
  expect(renamedNamespace.value).toBe('direct-value')
})

it('preserves nested namespace runtime behavior', () => {
  expect(nestedNamespace.locales.en).toBe('en')
  expect(nestedNamespace.locales.de).toBe('de')
})

it('supports a top-level-await namespace target', () => {
  expect(asyncNamespace.asyncValue).toBe('async-value')
})
