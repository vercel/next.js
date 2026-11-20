import value, * as staticNs from './vercel.mjs'

it('shares a module between a static and a dynamic import', async () => {
  expect(value).toBe('turbopack')

  const dynamicNs = await import('./vercel.mjs')
  expect(dynamicNs.default).toBe('turbopack')
  expect(dynamicNs).toBe(staticNs)
  // The module is only evaluated once.
  expect(globalThis.vercelEvaluations).toBe(1)
})

it('resolves a dynamic import of an already available module without loading a chunk', async () => {
  // The module is already available through the static import, so the dynamic import must
  // resolve within a single microtask tick. Loading a chunk would take longer, and the race
  // would then settle with the promise that resolves after one tick.
  //
  // The harness loads this test file through a dynamic import itself, so this relies on
  // `productionChunking` (see `options.json`), which tracks module availability across nested
  // async chunk groups.
  const dynamicImport = import('./vercel.mjs')
  const afterOneTick = Promise.resolve().then(() => 'one tick passed')
  const result = await Promise.race([dynamicImport, afterOneTick])
  expect(result).toBe(staticNs)
})
