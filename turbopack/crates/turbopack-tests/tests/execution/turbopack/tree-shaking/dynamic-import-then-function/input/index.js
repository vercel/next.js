it('should tree-shake unused exports with .then() function destructured dynamic import', async () => {
  const result = await new Promise((resolve) => {
    import('./lib').then(function ({ cat, default: def, exportsInfo }) {
      resolve({ cat, def, exportsInfo })
    })
  })
  expect(result.cat).toBe('cat')
  expect(result.def).toBe('the default value')
  expect(result.exportsInfo.cat.used).toBe(true)
  expect(result.exportsInfo.default.used).toBe(true)
  expect(result.exportsInfo.dogRef.used).toBe(false)
  expect(result.exportsInfo.initialCat.used).toBe(false)
  expect(result.exportsInfo.getChimera.used).toBe(false)
})
