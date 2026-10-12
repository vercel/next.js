it('should not tree-shake exports accessed via a deferred require binding', () => {
  const { interface: URL } = require('./wrapper')
  const u = new URL('https://example.com/')
  expect(u._impl).toBeTruthy()
  expect(u._impl.href).toBe('https://example.com/')
})

it('should still tree-shake unused exports from the deferred module', () => {
  const Impl = require('./impl')
  // "implementation" is used (via wrapper.js), "unused" is not
  // expect(Impl.usedExports).toEqual(["implementation", "usedExports"]);
})
