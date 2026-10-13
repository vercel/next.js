import {
  assert,
  assertType,
  expect,
  expectTypeOf,
  test,
  vi,
} from 'next/experimental/testing/vitest'

test('TypeScript authoring uses Next', () => {
  const add = vi.fn((a: number, b: number) => a + b)
  expect(add(2, 3)).toBe(5)
  expect(add).toHaveBeenCalledWith(2, 3)
  assert.strictEqual(add(1, 2), 3)
  assertType<number>(add(1, 2))
  expectTypeOf(add(1, 2)).toEqualTypeOf<number>()
})
