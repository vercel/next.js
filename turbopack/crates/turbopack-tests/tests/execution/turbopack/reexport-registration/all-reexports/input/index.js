it('evaluates all re-export sources in source order', async () => {
  const { order } = await import('./order')
  await import('./reexports')
  expect(order).toEqual(['x', 'y'])
})

it('re-exports the values', async () => {
  const ns = await import('./reexports')
  expect(ns.x).toBe('x')
  expect(ns.y).toBe('y')
})
