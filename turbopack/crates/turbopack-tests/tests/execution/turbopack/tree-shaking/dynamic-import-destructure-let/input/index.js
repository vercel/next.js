it('should tree-shake unused exports with let destructured dynamic import', async () => {
  let { cat, exportsInfo } = await import('./lib')
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dogRef.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
