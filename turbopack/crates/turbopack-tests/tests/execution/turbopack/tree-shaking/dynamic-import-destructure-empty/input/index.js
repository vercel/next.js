it('should tree-shake all exports with empty destructured dynamic import', async () => {
  const { exportsInfo } = await import('./lib')
  expect(exportsInfo.cat.used).toBe(false)
  expect(exportsInfo.dogRef.used).toBe(false)
  expect(exportsInfo.initialCat.used).toBe(false)
  expect(exportsInfo.getChimera.used).toBe(false)
})
