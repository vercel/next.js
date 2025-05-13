it('__dirname and __filename should be set', () => {
  expect(__dirname).toEqual(
    '/ROOT/turbopack/crates/turbopack-tests/tests/execution/turbopack/code-gen/dirname-filename/input'
  )
  expect(__filename).toEqual(
    '/ROOT/turbopack/crates/turbopack-tests/tests/execution/turbopack/code-gen/dirname-filename/input/index.js'
  )
})
