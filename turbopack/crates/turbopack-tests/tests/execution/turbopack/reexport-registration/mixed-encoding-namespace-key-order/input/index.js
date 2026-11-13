it('lists the exports of a namespace in code unit order', async () => {
  const ns = await import('./reexports')
  expect(Object.keys(ns)).toEqual(['b', 'c', 'has,comma'])
})
