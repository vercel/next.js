import './setup.js'
import './m0.js'

const order = [...globalThis.evaluationOrder]

// `m1`, `m5`, `m4` and `m2` are one list, in this order. `m3` loads `m1` while `m2` is evaluated,
// so `m1` imports `m5` before `m4` does: `m5` and `m4` must not be merged.
it('should not merge a module that an earlier module of its list imports first when the list is loaded again', () => {
  expect(order).toEqual(['m3', 'm5', 'm1', 'm4', 'm2', 'm0'])
})
