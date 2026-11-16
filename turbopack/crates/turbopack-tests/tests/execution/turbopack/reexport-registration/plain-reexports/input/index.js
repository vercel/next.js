it('re-exports names from the same source in separate statements', async () => {
  const ns = await import('./reexports')
  expect(ns.a).toBe('a')
  expect(ns.b).toBe('b')
  // ESM namespace objects list their exports in alphabetical order.
  expect(Object.keys(ns)).toEqual(['a', 'b'])
})
