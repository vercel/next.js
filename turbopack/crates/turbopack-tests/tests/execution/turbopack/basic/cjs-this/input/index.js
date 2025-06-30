const t = this

it('`this` in cjs should be exports', () => {
  expect(t).toBe(exports)
  let o = {
    get foo() {
      return this
    },
  }
  expect(o.foo).toBe(exports)
})

// Use a dummy assignment to ensure we are parsed as a cjs module
exports.something = 'something'
