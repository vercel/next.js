import './lib.mjs'

it('keeps top-level `this` undefined in an ES module without exports', () => {
  expect(globalThis.esmThisType).toBe('undefined')
})
