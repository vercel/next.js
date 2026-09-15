it('keeps a side-effect-only import and its ordering', async () => {
  const { order } = await import('./order')
  await import('./reexports')
  expect(order).toEqual(['a', 'effect'])
})
