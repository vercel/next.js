it('should tree-shake unused exports with .then() arrow destructured dynamic import', async () => {
  const result = await new Promise((resolve) => {
    import('./lib').then(({ cat, exportsInfo }) => {
      resolve({ cat, exportsInfo })
    })
  })
  expect(result.cat).toBe('cat')
  expect(result.exportsInfo.cat.used).toBe(true)
  expect(result.exportsInfo.dogRef.used).toBe(false)
  expect(result.exportsInfo.initialCat.used).toBe(false)
  expect(result.exportsInfo.getChimera.used).toBe(false)
})
