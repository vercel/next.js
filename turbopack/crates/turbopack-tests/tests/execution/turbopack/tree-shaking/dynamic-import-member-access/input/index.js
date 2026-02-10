it('should tree-shake unused exports with member access on dynamic import', async () => {
  const cat = (await import('./lib')).cat
  const { exportsInfo } = await import('./lib')
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dogRef.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
