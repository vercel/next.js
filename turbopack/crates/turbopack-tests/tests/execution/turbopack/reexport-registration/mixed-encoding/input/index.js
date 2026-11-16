it('re-exports names with and without commas from several sources', async () => {
  const ns = await import('./reexports')
  expect(ns['has,comma']).toBe('comma-value')
  expect(ns.b).toBe('b-value')
  expect(ns.c).toBe('c-value')
  expect(Object.keys(ns)).toEqual(['b', 'c', 'has,comma'])
})
