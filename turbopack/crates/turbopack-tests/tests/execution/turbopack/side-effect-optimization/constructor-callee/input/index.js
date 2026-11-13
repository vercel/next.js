import './callee.js'

it('retains effects from evaluating a PURE constructor callee', () => {
  expect(globalThis.constructorCallee).toBe('evaluated')
})
