'use cache'

// No method nor function property should be considered a cache function.
export const obj = {
  foo() {
    return 1
  },
  async bar() {
    return 2
  },
  baz: () => 2,
  qux: async () => 3,
}
