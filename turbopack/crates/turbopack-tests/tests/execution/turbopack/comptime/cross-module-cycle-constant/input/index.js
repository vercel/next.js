it('does not hang on constants that depend on each other in a cycle', async () => {
  // The build must not hang trying to evaluate `ONE` and `TWO` at compile time.
  // At runtime `multiple-2.js` is evaluated first and reads `ONE` before it is
  // initialized.
  await expect(import('./multiple-1.js')).rejects.toThrow(ReferenceError)
})
