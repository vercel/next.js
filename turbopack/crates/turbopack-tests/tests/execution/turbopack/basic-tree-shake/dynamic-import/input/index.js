it('keeps the side effects and exports of a dynamically imported module', async () => {
  const lib = await import('./lib')
  expect(globalThis.dogLogs).toHaveLength(3)
  expect(lib.cat).toBe('cat')
  expect(lib.initialCat).toBe('cat')
  expect(lib.dogRef.initial).toBe('dog!!!')
  expect(lib.getChimera()).toBe('catdog!!!')
})
