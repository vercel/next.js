const t = this

it('`this` in esm should be undefined', () => {
  expect(t).toBeUndefined()
  let o = {
    get foo() {
      return this
    },
  }
  // Regression test for a bug where we didn't identify the `this` ref in `foo` as being bound.
  expect(o.foo).toBe(o)
})

// Use a dummy export to ensure this is parsed as an esm module
export const foo = t
