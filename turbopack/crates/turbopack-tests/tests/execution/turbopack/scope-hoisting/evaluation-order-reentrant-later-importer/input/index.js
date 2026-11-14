import './setup.js'

// The first reference of this module is `m7`, the first module that is loaded is `m4`.
const load = {
  m7: () => require('./m7.js'),
  m4: () => require('./m4.js'),
}

// `m5`, `m4`, `m3` and `m7` are one list, in this order, and `m3` and `m7` are one group. `m6`
// loads `m7` while `m4` is evaluated, so `m3` imports `m5` before `m4` does: `m5` and `m4` must
// not be merged.
it('should not merge a module that a later module of its list imports first when the list is loaded again', () => {
  const order = ['m5', 'm3', 'm7', 'm6', 'm4']
  load.m4()
  expect(globalThis.evaluationOrder).toEqual(order)
  load.m7()
  expect(globalThis.evaluationOrder).toEqual(order)
})
