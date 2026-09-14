import * as ns from './ns.js'

it('keeps the namespace as the receiver for method calls', () => {
  // `ns.method()` must still pass `ns` as `this`.
  expect(ns.method()).toBe('has-this')
})

it('keeps the namespace as the receiver for tagged templates', () => {
  // ``ns.tag`...` `` also invokes `tag` with `ns` as the receiver.
  expect(ns.tag`x`).toBe('has-this')
})

it('does not provide a receiver once the member is detached', () => {
  const detached = ns.method
  expect(detached()).toBe('no-this')
})

it('does not provide a receiver for indirect calls', () => {
  expect((0, ns.method)()).toBe('no-this')
})

it('constructs namespace members without passing the namespace as this', () => {
  const instance = new ns.Klass()
  expect(instance.ok).toBe('constructed')
})

it('reads plain namespace values', () => {
  expect(ns.value + 1).toBe(42)
  expect([ns.value, ns.value]).toEqual([41, 41])
})

it('keeps the inner object as the receiver for nested member calls', () => {
  // The receiver here is `ns.nested`, not `ns`.
  expect(ns.nested.deep()).toBe('has-this')
})
