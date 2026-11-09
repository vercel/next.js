import './setup.js'

it('should evaluate modules in import order when a `require()` in an ES module loads an importer of a module that is being evaluated', async () => {
  // `w.js` calls a function of `h.js` that requires `s.js` while `x.js` is being evaluated.
  // `s.js` imports `x.js` and `m2.js`, which `x.js` imports after `m1.js`.
  await import('./r.js')
  expect(globalThis.evaluationOrder).toEqual([
    'h',
    'm2',
    's',
    'w',
    'm1',
    'x',
    'r',
  ])
  expect(globalThis.seenByX).toBe('m1m2')

  await import('./t.js')
  expect(globalThis.evaluationOrder.slice(7)).toEqual(['t'])
})
