it('should tree-shake unused exports with nested destructured dynamic import', async () => {
  const {
    dogRef: { get },
    exportsInfo,
  } = await import('./lib')
  expect(typeof get).toBe('function')
  expect(exportsInfo.dogRef.used).toBe(true)
  expect(exportsInfo.cat.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
