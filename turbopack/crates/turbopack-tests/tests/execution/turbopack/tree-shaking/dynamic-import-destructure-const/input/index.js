it('should tree-shake unused exports with const destructured dynamic import', async () => {
  const { cat, exportsInfo } = await import('./lib')
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dog.used).toBe(false)
})
