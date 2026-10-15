import { test, expect } from 'vitest'
class Amount {
  constructor(value) {
    this.value = value
  }
}
expect.addEqualityTesters([
  function (a, b) {
    if (a instanceof Amount && b instanceof Amount) return a.value === b.value
    if (a instanceof Amount || b instanceof Amount) return false
  },
])
test('custom equality applies recursively and in asymmetric matchers', () => {
  expect({ items: [new Amount(3)] }).toEqual({ items: [new Amount(3)] })
  expect([new Amount(4)]).toEqual(expect.arrayContaining([new Amount(4)]))
  expect(new Amount(3)).not.toEqual(new Amount(4))
  expect(new Amount(3)).not.toEqual({ value: 3 })
})
