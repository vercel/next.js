it('should tree-shake unused exports with default destructured dynamic import', async () => {
  const { default: defaultValue, exportsInfo } = await import('./lib')
  expect(defaultValue).toBe('the default value')
  expect(exportsInfo.default.used).toBe(true)
  expect(exportsInfo.cat.used).toBe(false)
  expect(exportsInfo.dogRef.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
