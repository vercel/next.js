it('should allow reexport cycles', async () => {
  const module = await import('./a.js')
  expect(module.value).toBe(42)
  expect(module.reexported).toBe(42)
})
