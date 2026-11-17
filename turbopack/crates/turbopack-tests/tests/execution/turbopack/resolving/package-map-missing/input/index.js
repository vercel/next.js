it('should not resolve any package when the package map does not exist', () => {
  // The `node_modules` folders are not a fallback.
  expect(() => require('dep')).toThrow()
})
