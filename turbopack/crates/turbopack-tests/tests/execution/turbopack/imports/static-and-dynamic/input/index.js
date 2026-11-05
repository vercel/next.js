import value, * as staticNs from './vercel.mjs'

it('shares a module between a static and a dynamic import', async () => {
  expect(value).toBe('turbopack')

  const dynamicNs = await import('./vercel.mjs')
  expect(dynamicNs.default).toBe('turbopack')
  expect(dynamicNs).toBe(staticNs)
  // The module is only evaluated once.
  expect(globalThis.vercelEvaluations).toBe(1)
})
