import { test, expect, vi } from 'vitest'
test('deep object automock', () => {
  const original = { nested: { fn: () => 42 }, array: [1] }
  const mocked = vi.mockObject(original)
  expect(vi.isMockFunction(mocked.nested.fn)).toBe(true)
  expect(mocked.nested.fn()).toBeUndefined()
  expect(original.nested.fn()).toBe(42)
})
