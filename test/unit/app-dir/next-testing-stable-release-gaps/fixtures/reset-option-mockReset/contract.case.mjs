import { test, expect, vi } from 'vitest'
const fn = vi.fn(() => 42)
test('changes implementation', () => {
  fn.mockImplementation(() => 99)
  expect(fn()).toBe(99)
})
test('automatic reset before next case', () => {
  expect(fn()).toBe(42)
  expect(fn).toHaveBeenCalledOnce()
})
