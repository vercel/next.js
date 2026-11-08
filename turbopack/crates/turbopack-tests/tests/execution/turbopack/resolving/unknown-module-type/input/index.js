// Importing a file without a module type must report an error at the import.
// The value of this test is the `issues/` snapshot.

it('should throw when the file is required', () => {
  expect(() => require('./content/gamma.txt')).toThrow()
})
