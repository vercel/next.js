it('should mark all exports as used with non-destructured dynamic import', async () => {
  const lib = await import('./lib')
  expect(lib.cat).toBe('cat')
  expect(lib.exportsInfo.cat.used).toBe(true)
  expect(lib.exportsInfo.dogRef.used).toBe(true)
  expect(lib.exportsInfo.initialCat.used).toBe(true)
  expect(lib.exportsInfo.getChimera.used).toBe(true)
})
