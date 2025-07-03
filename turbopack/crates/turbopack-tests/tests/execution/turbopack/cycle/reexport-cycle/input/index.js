// TODO this test has not the expected behavior yet. But it's still here to check if the compilation doesn't crash or hang.

it('should error on reexport cycles', async () => {
  await import('./a')
  // TODO this is not working yet. We need to throw an SyntaxError in that case.
  // await expect(import('./a')).rejects.toThrowError('')
})

it('should error on self reexport cycle', async () => {
  await import('./self')
  // TODO this is not working yet. We need to throw an SyntaxError in that case.
  // await expect(import('./self')).rejects.toThrowError('')
})
