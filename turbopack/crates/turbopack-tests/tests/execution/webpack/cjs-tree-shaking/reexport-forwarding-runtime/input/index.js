import sourceDefault, { named } from './forwarder'
import * as namespace from './forwarder'
import './side-effect-forwarder'

it('preserves ESM default, named, and namespace interop through a CJS forwarder', () => {
  expect(sourceDefault).toBe('default')
  expect(named).toBe('named')
  expect(namespace.named).toBe('named')
  expect(namespace.other).toBe('other')
  expect(namespace.default).toBe('default')
})

it('forwards opaque whole-namespace usage and evaluates the target once', () => {
  const opaque = Object(require('./forwarder'))
  expect(Object.keys(opaque)).toEqual(
    expect.arrayContaining(['default', 'named', 'other'])
  )
  expect(globalThis.__forwarded_side_effects).toBe(1)
})

it('preserves evaluation through a forwarder when no exports are read', () => {
  expect(globalThis.__side_effect_only_forwarded).toBe(1)
})
