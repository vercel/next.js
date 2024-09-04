it('should support require.resolve', () => {
  expect(require.resolve('./resolved.js')).toBe(
    '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/resolving/require-resolve/input/resolved.js [test] (ecmascript)'
  )
})

it('should support require.resolve with extensions', () => {
  expect(require.resolve('./resolved')).toBe(
    '[project]/turbopack/crates/turbopack-tests/tests/execution/turbopack/resolving/require-resolve/input/resolved.js [test] (ecmascript)'
  )
})
