it('re-exports a name containing a comma', async () => {
  const ns = await import('./reexports')
  expect(ns['has,comma']).toBe('comma-value')
  expect(ns.plain).toBe('plain-value')
})
