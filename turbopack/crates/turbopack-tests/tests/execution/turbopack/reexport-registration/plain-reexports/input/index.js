it('re-exports names from the same source in separate statements', async () => {
  const ns = await import('./reexports')
  expect(ns.a).toBe('a')
  expect(ns.b).toBe('b')
  expect(Object.keys(ns).sort()).toEqual(['a', 'b'])
})
