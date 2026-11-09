it('loads a dynamically imported module', async () => {
  const mod = await import('./vercel.mjs')
  expect(mod.default).toBe('turbopack')
})
