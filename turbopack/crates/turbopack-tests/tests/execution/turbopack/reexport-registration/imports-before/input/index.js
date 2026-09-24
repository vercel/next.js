it('keeps order when plain imports precede the re-exports', async () => {
  const { order } = await import('./order')
  await import('./reexports')
  expect(order).toEqual(['first', 'a', 'b'])
})
