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

it('keeps the receiver for a live binding reassigned to a this-using function', () => {
  // The declared value ignores `this`, so the receiver may only be dropped if the
  // binding cannot be reassigned. It can be, so the namespace has to be preserved.
  ns.swap()
  expect(ns.swappable()).toBe('has-this')
})

it('keeps the namespace as the receiver for optional calls', () => {
  // `ns.f?.()` still calls `f` with `ns` as the receiver.
  expect(ns.method?.()).toBe('has-this')
})

it('still throws when an update expression writes to a read-only export', () => {
  // Illegal in ESM, but SWC parses it; capturing it into a local would silently
  // mutate the local instead of throwing.
  expect(() => {
    ns.readOnly++
  }).toThrow(TypeError)
  expect(ns.readOnly).toBe(1)
})

it('still throws when a for-of head writes to a read-only export', () => {
  expect(() => {
    for (ns.readOnly of [2]) {
      // the assignment itself is what must throw
    }
  }).toThrow(TypeError)
  expect(ns.readOnly).toBe(1)
})

it('keeps the inner object as the receiver for nested member calls', () => {
  // The receiver here is `ns.nested`, not `ns`.
  expect(ns.nested.deep()).toBe('has-this')
})

it('keeps the receiver for a function whose body uses direct eval', () => {
  // `eval` runs in the enclosing scope, so it can observe `this` even though no
  // `this` appears anywhere in the source of `viaEval`.
  expect(ns.viaEval()).toBe('has-this')
})

it('drops the receiver when the only `this` belongs to an inner class body', () => {
  // Every `this` inside `Inner` -- method, field initializer, static block -- binds
  // to the class, so `usesOnlyClassThis` observes no receiver of its own and is
  // captured into a local rather than called through the namespace.
  const Inner = ns.usesOnlyClassThis()
  expect(Inner.tag).toBe('static-block')
  const instance = new Inner()
  expect(instance.field).toBe(instance)
  expect(instance.m()).toBe(undefined)
})
