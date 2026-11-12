it('re-exports names with and without commas from several sources', async () => {
  const ns = await import('./reexports')
  expect(ns['has,comma']).toBe('comma-value')
  expect(ns.b).toBe('b-value')
  expect(ns.c).toBe('c-value')
  // Sorted because the namespace doesn't list the exports in code unit order yet, see
  // `__skipped__/mixed-encoding-namespace-key-order`.
  expect(Object.keys(ns).sort()).toEqual(['b', 'c', 'has,comma'])
})
