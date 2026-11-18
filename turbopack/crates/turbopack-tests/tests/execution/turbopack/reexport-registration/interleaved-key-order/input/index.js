it('lists interleaved re-exports in code unit order without reordering evaluation', async () => {
  const { order } = await import('./order')
  const ns = await import('./reexports')
  expect(Object.keys(ns)).toEqual(['a', 'b', 'c', 'd', '😀', '｡'])
  expect(ns.a).toBe('a-value')
  expect(ns.b).toBe('b-value')
  expect(ns.c).toBe('c-value')
  expect(ns.d).toBe('d-value')
  expect(ns['😀']).toBe('grinning-value')
  expect(ns['｡']).toBe('halfwidth-stop-value')
  // The sources still evaluate in import order.
  expect(order).toEqual(['first', 'second', 'third'])
})
