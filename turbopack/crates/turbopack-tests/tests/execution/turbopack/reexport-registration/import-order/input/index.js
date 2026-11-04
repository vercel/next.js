it('instantiates re-exported and imported modules in source order', async () => {
  const { order } = await import('./order')
  await import('./reexports')

  // './a' is re-exported before './b' is imported, and './c' is re-exported
  // after, so evaluation must follow source order.
  expect(order).toEqual(['a', 'b', 'c'])
})

it('re-exports the values', async () => {
  const ns = await import('./reexports')
  expect(ns.a).toBe('a')
  expect(ns.c).toBe('c')
})
