it('preserves earlier import order when re-exports list the sources in reverse', async () => {
  const { order } = await import('./order')
  const ns = await import('./reexports')

  expect(order).toEqual(['a', 'b'])
  expect(ns.a).toBe('a')
  expect(ns.b).toBe('b')
})
