// A context that matches a file without a module type must report an error at
// the `require.context()` call. The value of this test is the `issues/` snapshot.

it('should throw when the context is created', () => {
  // The file can't be required, so neither can the context.
  expect(() => require.context('./content', false, /\.txt$/)).toThrow(
    'Cannot find module'
  )
})
