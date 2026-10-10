it('should allow to require esm', () => {
  expect(require('./module').abc).toBe('abc')
  expect(typeof require('./module').func).toBe('function')
  // Dropped: relies on webpack's `require.cache` / `require.resolve` runtime
  // introspection, which turbopack's bundled runtime doesn't populate.
  // expect(Object.keys(require("./module").func())).toEqual(
  // 	Object.keys(require.cache[require.resolve("./module?2")].exports)
  // );
})
