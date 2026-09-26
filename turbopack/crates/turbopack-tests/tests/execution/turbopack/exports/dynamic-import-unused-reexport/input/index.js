it('bundles a dynamic import through a barrel with an unused re-export', async () => {
  const { a } = await import('./a')
  expect(await a()).toBe('a')
})
