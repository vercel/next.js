import * as ns from './live_exports.js'

it('hoisted declarations are live', () => {
  expect(ns.bar()).toBe('bar')
  ns.setBar(() => 'patched')
  expect(ns.bar()).toBe('patched')
})

it('exported lets are live', () => {
  expect(ns.foo).toBe('foo')
  ns.setFoo('new')
  expect(ns.foo).toBe('new')
})

it('exported local bindings that are not mutated are not live', () => {
  expect(Object.getOwnPropertyDescriptor(ns, 'obviouslyneverMutated')).toEqual(
    expect.objectContaining({
      enumerable: true,
      configurable: false,
      value: 'obviouslyneverMutated',
    })
  )
  expect(Object.getOwnPropertyDescriptor(ns, 'neverMutated')).toEqual(
    expect.objectContaining({
      enumerable: true,
      configurable: false,
      value: 'neverMutated',
    })
  )
})

it('exported bindings that are free vars are live', () => {
  const gDesc = Object.getOwnPropertyDescriptor(ns, 'g')
  expect(gDesc).toEqual(
    expect.objectContaining({
      enumerable: true,
      configurable: false,
      set: undefined,
    })
  )
  expect(gDesc).toHaveProperty('get')
})
