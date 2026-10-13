import {
  assert,
  assertType,
  expect,
  expectTypeOf,
  test,
} from 'next/experimental/testing/vitest'

test('JavaScript authoring uses Next', () => {
  expect([1, 2, 3]).toHaveLength(3)
  assert.deepEqual([1, 2], [1, 2])
  assertType(42)
  expectTypeOf(42).toBeNumber()
})
