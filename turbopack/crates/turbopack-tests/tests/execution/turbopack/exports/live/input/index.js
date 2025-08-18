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
  // These should be bound to values, but we don't have the analysis yet
  expectGetter('obviouslyneverMutated')
  expectGetter('neverMutated')
})

it('exported bindings that are free vars are live', () => {
  expectGetter('g')
})

function expectGetter(propName) {
  const gDesc = Object.getOwnPropertyDescriptor(ns, propName)
  expect(gDesc).toEqual(
    expect.objectContaining({
      enumerable: true,
      configurable: false,
      set: undefined,
    })
  )
  expect(gDesc).toHaveProperty('get')
}
