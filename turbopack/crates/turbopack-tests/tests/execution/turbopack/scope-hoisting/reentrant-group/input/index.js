it('should evaluate a merged module group only once', async () => {
  const { instance, instanceFromClosure } = await import('./entry1.js')
  await import('./entry2.js')

  expect(globalThis.__evaluations).toBe(1)
  expect(instanceFromClosure()).toBe(instance)
})
