it('should tree-shake unused exports with webpackExports comment', async () => {
  const { cat, exportsInfo } = await import(
    /* webpackExports: ["cat", "exportsInfo"] */ './lib'
  )
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dogRef.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
