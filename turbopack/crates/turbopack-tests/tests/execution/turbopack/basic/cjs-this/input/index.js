const t = this

it('`this` in cjs should be exports', () => {
  expect(t).toBe(exports)
  let o = {
    get foo() {
      return this
    },
  }
  // Regression test for a bug where we didn't identify the `this` ref in `foo` as being bound.
  expect(o.foo).toBe(o)
})

// Use a dummy assignment to ensure we are parsed as a cjs module
exports.something = 'something'
