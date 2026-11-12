// Expected to fail: ESM namespace objects must list their exports in code unit order, but when
// names are re-exported from several modules, the namespace lists them module by module
// (`b`, `has,comma`, `c`).
it('lists the exports of a namespace in code unit order', async () => {
  const ns = await import('./reexports')
  expect(Object.keys(ns)).toEqual(['b', 'c', 'has,comma'])
})
