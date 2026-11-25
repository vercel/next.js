const ns = require('./consumer.cjs')

it('re-exports from a callable CommonJS namespace', () => {
  expect(ns.default()).toBe('called')
  expect(ns.named).toBe('named')
  expect(globalThis.callableNamespaceAfter).toBe(true)
})
