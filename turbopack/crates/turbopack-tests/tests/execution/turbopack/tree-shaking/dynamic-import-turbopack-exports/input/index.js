it('should tree-shake unused exports with turbopackExports comment', async () => {
  const { cat, exportsInfo } = await import(
    /* turbopackExports: ["cat", "exportsInfo"] */ './lib'
  )
  expect(cat).toBe('cat')
  expect(exportsInfo.cat.used).toBe(true)
  expect(exportsInfo.dogRef.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
