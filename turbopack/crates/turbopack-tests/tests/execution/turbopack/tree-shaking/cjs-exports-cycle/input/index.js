// A `require()` cycle a -> b -> a between split CommonJS modules. The exports
// object identity is shared like in Node.js, so the (very common) deferred
// access pattern — reading the other module's exports inside a function called
// after the cycle completed — observes the final values.
//
// Intentionally unsupported: *top-level* reads of the other module mid-cycle
// observe an empty exports object instead of Node's partially-populated one,
// because a split module's exports are written by its facade after evaluation
// instead of interleaved with it.

it('should share exports object identity so deferred reads see final values', () => {
  const b = require('./b')
  expect(b.deferredEarly()).toBe('a-early')
  expect(b.deferredLate()).toBe('a-late')
})

it('should complete the cycle and expose post-cycle values', () => {
  const a = require('./a')
  expect(a.early).toBe('a-early')
  expect(a.late).toBe('a-late')
})
