it('registers a partially used re-export facade whose other source was pruned', async () => {
  const { value } = await import('./barrel')
  expect(value).toBe('value')
})
