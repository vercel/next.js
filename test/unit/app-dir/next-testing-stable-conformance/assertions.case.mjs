import { test, assert, assertType, expectTypeOf } from 'vitest'
test('unchanged Chai assertion helper', () => {
  assert.strictEqual(2 + 2, 4)
  assert.deepEqual({ value: [1, 2] }, { value: [1, 2] })
  assert.throws(() => {
    throw new Error('expected')
  }, /expected/)
})
test('unchanged type assertion APIs', () => {
  assertType(42)
  expectTypeOf(42).toBeNumber()
  expectTypeOf('portable').toBeString()
})
