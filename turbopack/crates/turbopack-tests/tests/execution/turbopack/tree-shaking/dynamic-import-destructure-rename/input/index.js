it('should tree-shake unused exports with renamed destructured dynamic import', async () => {
  const { cat: myCat, exportsInfo } = await import('./lib')
  expect(myCat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dogRef.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
