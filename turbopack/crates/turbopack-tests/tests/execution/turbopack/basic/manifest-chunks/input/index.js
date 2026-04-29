it('should work', async () => {
  let mod = await import('./other')
  expect(mod.default).toBe('other')
})
