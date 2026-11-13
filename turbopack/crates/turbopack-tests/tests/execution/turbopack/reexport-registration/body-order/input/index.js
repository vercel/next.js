it('evaluates a re-exported dependency before the module body', async () => {
  const { order } = await import('./order')
  await import('./reexports')
  expect(order).toEqual(['a', 'body'])
})
