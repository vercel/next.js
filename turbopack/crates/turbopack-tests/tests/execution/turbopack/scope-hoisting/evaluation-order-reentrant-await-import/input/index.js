import './setup.js'

// This pins the order only. No condition of the rule for import cycles decides it: an import
// passes a top-level await on to its importers, so the whole cycle is async and nothing inherits
// the merge group of one of its modules.
it('should evaluate modules in import order when a cycle of imports holds a module with a top-level await', async () => {
  // `n.js` has a top-level await, so it is not merged, and neither are `m.js`, `p.js` and
  // `r.js`, which import it. `p.js` imports `c.js` between `a.js` and `b.js`, which `m.js` and
  // `t.js` import one after the other.
  await import('./r.js')
  expect(globalThis.evaluationOrder).toEqual([
    'a',
    'c',
    'b',
    'p',
    'n',
    'm',
    'r',
  ])

  const { t } = await import('./t.js')
  expect(t).toBe('ab')
  expect(globalThis.evaluationOrder.slice(7)).toEqual(['t'])
})
