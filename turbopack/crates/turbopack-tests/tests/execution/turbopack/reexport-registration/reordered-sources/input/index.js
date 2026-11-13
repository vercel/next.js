it('lists re-exports in code unit order when that reverses the sources', async () => {
  const { order } = await import('./order')
  const ns = await import('./reexports')
  expect(Object.keys(ns)).toEqual(['a', 'y', 'z'])
  expect(ns.a).toBe('a-value')
  expect(ns.y).toBe('y-value')
  expect(ns.z).toBe('z-value')
  // The sources still evaluate in import order.
  expect(order).toEqual(['first', 'second'])
})
