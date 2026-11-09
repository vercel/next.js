import './setup.js'

it('should evaluate modules in import order when a cycle of imports holds a module that is not merged', async () => {
  // `n.js` has a direct `eval`, so it is not merged, and its import loads `p.js` while `m.js` is
  // being evaluated. `p.js` imports `c.js` between `a.js` and `b.js`, which `m.js` and `t.js`
  // import one after the other.
  await import('./r.js')
  expect(globalThis.evaluationOrder).toEqual(['a', 'c', 'b', 'p', 'n', 'm', 'r'])

  const { t } = await import('./t.js')
  expect(t).toBe('ab')
  expect(globalThis.evaluationOrder.slice(7)).toEqual(['t'])
})
