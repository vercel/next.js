it('registers several source modules in one compact call', async () => {
  const { order } = await import('./order')
  const ns = await import('./reexports')
  // Values come through the compact registration, across the group separator.
  expect(ns.a).toBe('a-value')
  expect(ns.b).toBe('b-value')
  expect(ns.c).toBe('c-value')
  // The groups are instantiated in source order.
  expect(order).toEqual(['first', 'second'])
})
