it('registers the retained source but does not look up the pruned one', async () => {
  const { value } = await import('./barrel')
  expect(value).toBe('value')
})
