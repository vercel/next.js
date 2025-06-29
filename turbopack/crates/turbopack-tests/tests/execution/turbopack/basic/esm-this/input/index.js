const t = this

it('`this` in esm should be undefined', () => {
  expect(t).toBeUndefined()
})

// Use a dummy export to ensure this is parsed as an esm module
export const foo = t
