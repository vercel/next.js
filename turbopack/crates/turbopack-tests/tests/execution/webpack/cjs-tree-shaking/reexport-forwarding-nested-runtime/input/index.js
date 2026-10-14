it('preserves a nested namespace reexported through CJS', () => {
  expect(require('./b-mid').inner.x).toBe(1)
})

it('preserves a namespace member assigned through CJS', () => {
  expect(require('./c-mid').p).toBe(1)
})

it('preserves a depth-two nested namespace reexported through CJS', () => {
  expect(require('./f-cjs').mid.deep.x).toBe(1)
})

it('preserves namespace unwrapping after a forwarding hop', () => {
  expect(require('./j-hop2').w).toBe(1)
})
