// Each dynamic import becomes its own chunk, so each chunk picks its own layout for "use strict":
// - flat: too few strict factories to group, each keeps its own directive
// - mixed: strict factories grouped into a strict wrapper, followed by the sloppy one
// - all strict: the whole chunk is wrapped in a strict function
// Whatever the layout, every factory must keep the strictness of its module.

it('keeps strictness in a flat chunk', async () => {
  const { strict, sloppy } = await import('./flat/index.js')
  expect(strict).toBe(undefined)
  expect(sloppy).toBe(globalThis)
})

it('keeps strictness in a mixed chunk', async () => {
  const { strictA, strictB, strictC, sloppy } = await import('./mixed/index.js')
  expect(strictA).toBe(undefined)
  expect(strictB).toBe(undefined)
  expect(strictC).toBe(undefined)
  expect(sloppy).toBe(globalThis)
})

it('keeps strictness in an all-strict chunk', async () => {
  const { strictA, strictB, strictC } = await import('./all-strict/index.js')
  expect(strictA).toBe(undefined)
  expect(strictB).toBe(undefined)
  expect(strictC).toBe(undefined)
})
