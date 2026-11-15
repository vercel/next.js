it('loads nested async chunks sharing a module', async () => {
  const { first } = await import('./first')
  expect(await first()).toBe('sharedsharedshared')

  const { loadThird, second } = await import('./second')
  const { third } = await loadThird()
  expect(second).toBe('shared')
  expect(third).toBe('shared')
})
